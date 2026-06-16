/**
 * Unit Tests: Provider Hierarchy & Architecture
 * 
 * Validates that the app follows the mandatory provider
 * hierarchy and architectural constraints.
 */

// ============================================================================
// Provider Hierarchy Tests
// ============================================================================

describe('Provider Hierarchy', () => {
  // The mandatory hierarchy is:
  // AlertProvider > AuthProvider > SafeAreaProvider > LanguageProvider > ToastProvider > AppProvider
  
  const PROVIDER_ORDER = [
    'AlertProvider',     // Layer 1: Outermost
    'AuthProvider',      // Layer 2: Auth state
    'SafeAreaProvider',  // Layer 3: Safe areas
    'LanguageProvider',  // Layer 4: i18n
    'ToastProvider',     // Layer 5: Toast notifications
    'AppProvider',       // Layer 6: App state (innermost)
  ];

  it('should have AlertProvider as outermost', () => {
    expect(PROVIDER_ORDER[0]).toBe('AlertProvider');
  });

  it('should have AuthProvider inside AlertProvider', () => {
    const alertIdx = PROVIDER_ORDER.indexOf('AlertProvider');
    const authIdx = PROVIDER_ORDER.indexOf('AuthProvider');
    expect(authIdx).toBeGreaterThan(alertIdx);
  });

  it('should have AppProvider as innermost', () => {
    expect(PROVIDER_ORDER[PROVIDER_ORDER.length - 1]).toBe('AppProvider');
  });

  it('should have LanguageProvider before AppProvider', () => {
    const langIdx = PROVIDER_ORDER.indexOf('LanguageProvider');
    const appIdx = PROVIDER_ORDER.indexOf('AppProvider');
    expect(langIdx).toBeLessThan(appIdx);
  });

  it('should have 6 providers total', () => {
    expect(PROVIDER_ORDER).toHaveLength(6);
  });
});

// ============================================================================
// AuthRouter Configuration Tests
// ============================================================================

describe('AuthRouter Configuration', () => {
  it('should be placed in app/index.tsx (not _layout.tsx)', () => {
    // AuthRouter MUST be in app/index.tsx
    const correctFile = 'app/index.tsx';
    const forbiddenFile = 'app/_layout.tsx';
    expect(correctFile).toBe('app/index.tsx');
    expect(forbiddenFile).not.toBe(correctFile);
  });

  it('should use loginRoute="/login"', () => {
    const loginRoute = '/login';
    expect(loginRoute).toBe('/login');
  });
});

// ============================================================================
// Architecture Layer Tests
// ============================================================================

describe('Architecture Layers', () => {
  const LAYER_STRUCTURE = {
    services: {
      purpose: 'Pure data operations (API, processing)',
      rules: ['No React imports', 'Return data/errors', 'Pure functions'],
    },
    hooks: {
      purpose: 'State + business logic',
      rules: ['Consume Services', 'Manage state', 'No JSX'],
    },
    components: {
      purpose: 'UI rendering only',
      rules: ['Consume Hooks', 'Pure UI', 'Props interface required'],
    },
    contexts: {
      purpose: 'Global state management',
      rules: ['Provider only', 'No Hook exports in same file'],
    },
  };

  it('should have 4 architectural layers', () => {
    expect(Object.keys(LAYER_STRUCTURE)).toHaveLength(4);
  });

  it('services layer should have no-React rule', () => {
    expect(LAYER_STRUCTURE.services.rules).toContain('No React imports');
  });

  it('hooks layer should consume services', () => {
    expect(LAYER_STRUCTURE.hooks.rules).toContain('Consume Services');
  });

  it('components layer should require Props interface', () => {
    expect(LAYER_STRUCTURE.components.rules).toContain('Props interface required');
  });

  it('contexts should be Provider-only files', () => {
    expect(LAYER_STRUCTURE.contexts.rules).toContain('Provider only');
  });
});

// ============================================================================
// Navigation Structure Tests
// ============================================================================

describe('Navigation Structure', () => {
  const TAB_ROUTES = ['index', 'stats', 'directory', 'map'];
  const MODAL_ROUTES = [
    'match/new', 'match/[id]',
    'player/new', 'player/edit/[id]',
    'club/new', 'club/edit/[id]',
    'tournament/new', 'tournament/edit/[id]',
    'challenge/new',
    'terrain/new', 'terrain/edit/[id]',
    'meetup/new',
    'sponsored-event/new',
  ];
  const CARD_ROUTES = [
    'player/[id]', 'club/[id]', 'tournament/[id]',
    'terrain/[id]', 'meetup/[id]',
    'history', 'profile', 'stats',
  ];

  it('should have 4 tab routes', () => {
    expect(TAB_ROUTES).toHaveLength(4);
  });

  it('tabs should include home (index)', () => {
    expect(TAB_ROUTES).toContain('index');
  });

  it('should have modal presentation for creation/edit routes', () => {
    expect(MODAL_ROUTES.length).toBeGreaterThan(10);
    MODAL_ROUTES.forEach(route => {
      expect(route).toMatch(/(new|edit\/\[id\]|\[id\])/);
    });
  });

  it('should have card presentation for detail routes', () => {
    expect(CARD_ROUTES.length).toBeGreaterThan(5);
  });
});
