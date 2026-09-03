// @ts-nocheck
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';

/**
 * Google native sign-in in this app is intentionally independent from Supabase Auth.
 * While a Google-only user is active, every app-level Supabase call is routed to a
 * local no-op client. This prevents IDs such as `google:1075...` from ever being
 * sent to UUID columns and, more importantly, prevents accidental Supabase network
 * requests for the Google-only session.
 */
let googleOnlySupabaseBypass = false;

export function setGoogleOnlySupabaseBypass(enabled: boolean): void {
  googleOnlySupabaseBypass = enabled;
}

export function isGoogleOnlySupabaseBypassEnabled(): boolean {
  return googleOnlySupabaseBypass;
}

const EMPTY_LIST_RESULT = {
  data: [],
  error: null,
  count: 0,
  status: 200,
  statusText: 'OK',
};

const EMPTY_SINGLE_RESULT = {
  data: null,
  error: null,
  count: 0,
  status: 200,
  statusText: 'OK',
};

/**
 * Thenable, chainable query object that mirrors the Supabase query shape closely
 * enough for read/write calls to fail closed locally instead of touching the
 * network. Reads return an empty list; single/maybeSingle return null.
 */
function createGoogleOnlyQueryBuilder(): any {
  let builder: any;
  const listPromise = () => Promise.resolve(EMPTY_LIST_RESULT);

  builder = new Proxy(function () {}, {
    get(_target, prop) {
      // Make the query safely awaitable without accidentally creating or using a
      // real Supabase request. Returning Promise-compatible methods here keeps
      // patterns such as `await query`, `query.then(...)`, and `query.catch(...)`
      // working in Google-only mode.
      if (prop === 'then') {
        return (onFulfilled?: any, onRejected?: any) =>
          listPromise().then(onFulfilled, onRejected);
      }
      if (prop === 'catch') {
        return (onRejected?: any) => listPromise().catch(onRejected);
      }
      if (prop === 'finally') {
        return (onFinally?: any) => listPromise().finally(onFinally);
      }
      if (prop === 'single' || prop === 'maybeSingle') {
        return () => Promise.resolve(EMPTY_SINGLE_RESULT);
      }
      if (prop === 'csv') return () => Promise.resolve({ ...EMPTY_SINGLE_RESULT, data: '' });
      if (prop === Symbol.toStringTag) return 'GoogleOnlySupabaseQuery';

      // select/insert/update/delete/upsert and all filters/order/limit methods can
      // remain chainable. No remote operation is ever executed.
      return () => builder;
    },
    apply() {
      return builder;
    },
  });

  return builder;
}

const googleOnlyChannel = new Proxy(function () {}, {
  get(_target, prop) {
    if (prop === 'subscribe') {
      return (callback?: (status: string) => void) => {
        try { callback?.('SUBSCRIBED'); } catch { /* ignore */ }
        return googleOnlyChannel;
      };
    }
    if (prop === 'unsubscribe') return async () => 'ok';
    if (prop === Symbol.toStringTag) return 'GoogleOnlySupabaseChannel';
    return () => googleOnlyChannel;
  },
  apply() {
    return googleOnlyChannel;
  },
}) as any;

const googleOnlyStorageBucket = {
  upload: async () => EMPTY_SINGLE_RESULT,
  update: async () => EMPTY_SINGLE_RESULT,
  move: async () => EMPTY_SINGLE_RESULT,
  copy: async () => EMPTY_SINGLE_RESULT,
  remove: async () => EMPTY_LIST_RESULT,
  list: async () => EMPTY_LIST_RESULT,
  download: async () => EMPTY_SINGLE_RESULT,
  createSignedUrl: async () => ({ ...EMPTY_SINGLE_RESULT, data: null }),
  createSignedUrls: async () => EMPTY_LIST_RESULT,
  getPublicUrl: () => ({ data: { publicUrl: '' } }),
};

const googleOnlySupabaseClient: any = {
  from: () => createGoogleOnlyQueryBuilder(),
  // RPC calls may be awaited directly or further filtered/chained in app code.
  // A local query builder supports both shapes while still doing no network I/O.
  rpc: () => createGoogleOnlyQueryBuilder(),
  functions: {
    invoke: async () => EMPTY_SINGLE_RESULT,
  },
  storage: {
    from: () => googleOnlyStorageBucket,
  },
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    refreshSession: async () => ({ data: { session: null, user: null }, error: null }),
    signOut: async () => ({ error: null }),
    setSession: async () => ({ data: { session: null, user: null }, error: null }),
    exchangeCodeForSession: async () => ({ data: { session: null, user: null }, error: null }),
    updateUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({
      data: { subscription: { unsubscribe: () => {} } },
    }),
  },
  channel: () => googleOnlyChannel,
  removeChannel: async () => 'ok',
  removeAllChannels: async () => [],
  getChannels: () => [],
};

class SupabaseManager {
  private static instance: SupabaseClient | null = null;
  private static routingProxy: SupabaseClient | null = null;
  private static creating = false;
  private static creationCount = 0;

  /** Lazily creates the real Supabase client for email/password/OTP users. */
  private static getRealClient(): SupabaseClient {
    if (this.instance) {
      return this.instance;
    }

    if (this.creating) {
      throw new Error('[Template:Client] Client is being created, please wait');
    }

    this.creating = true;
    this.creationCount++;

    try {
      console.log(`[Template:Client] Creating Supabase client instance #${this.creationCount}`);

      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        const errorMsg = '[Template:Client] Supabase environment variables missing\n' +
          'Please check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env file';
        console.error(errorMsg);
        throw new Error(errorMsg);
      }

      if (this.creationCount > 1) {
        console.warn(`[Template:Client] ⚠️ Multiple client creation detected! This is creation #${this.creationCount}`);
        console.warn('[Template:Client] This may indicate a development environment hot reload or architecture issue.');
      }

      this.instance = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          storage: this.createStorageAdapter(),
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: Platform.OS === 'web',
          flowType: 'pkce',
        },
      });

      console.log('[Template:Client] Supabase client created successfully');
      return this.instance;
    } finally {
      this.creating = false;
    }
  }

  /**
   * Return one stable proxy so components that captured the client before Google
   * login still switch to the no-op path as soon as Google auth succeeds.
   */
  static getClient(): SupabaseClient {
    if (this.routingProxy) return this.routingProxy;

    this.routingProxy = new Proxy({} as SupabaseClient, {
      get: (_target, prop) => {
        const selected: any = googleOnlySupabaseBypass
          ? googleOnlySupabaseClient
          : this.getRealClient();
        const value = selected[prop as keyof typeof selected];
        return typeof value === 'function' ? value.bind(selected) : value;
      },
    });

    return this.routingProxy;
  }

  private static createStorageAdapter = () => {
    if (Platform.OS === 'web') {
      return {
        getItem: (key: string) => {
          if (typeof window !== 'undefined' && window.localStorage) {
            return Promise.resolve(window.localStorage.getItem(key));
          }
          return Promise.resolve(null);
        },
        setItem: (key: string, value: string) => {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(key, value);
            return Promise.resolve();
          }
          return Promise.resolve();
        },
        removeItem: (key: string) => {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem(key);
            return Promise.resolve();
          }
          return Promise.resolve();
        },
      };
    }

    return AsyncStorage;
  }
}

export const getSharedSupabaseClient = (): SupabaseClient => {
  return SupabaseManager.getClient();
};

export const safeSupabaseOperation = async <T>(
  operation: (client: SupabaseClient) => Promise<T>
): Promise<T> => {
  const client = getSharedSupabaseClient();
  return await operation(client);
};
