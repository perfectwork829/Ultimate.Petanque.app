// ============================================
// EMAIL VALIDATION SERVICE
// Blocks disposable/temporary email domains
// ============================================

// Top ~120 disposable email domains
const DISPOSABLE_DOMAINS: Set<string> = new Set([
  // Major disposable providers
  'guerrillamail.com', 'guerrillamail.de', 'guerrillamail.net', 'guerrillamail.org',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmail.net',
  'mailinator.com', 'mailinator.net', 'mailinator.org',
  'yopmail.com', 'yopmail.fr', 'yopmail.net',
  'throwaway.email', 'throwawaymail.com',
  'sharklasers.com', 'guerrillamailblock.com', 'grr.la', 'pokemail.net',
  'spam4.me', 'bccto.me', 'byom.de',
  'dispostable.com', 'trashmail.com', 'trashmail.me', 'trashmail.net',
  'maildrop.cc', 'mailnesia.com', 'mailcatch.com',
  'fakeinbox.com', 'fakemail.net',
  'getairmail.com', 'getnada.com', 'nada.email',
  'harakirimail.com', 'mailexpire.com', 'mailforspam.com',
  'mintemail.com', 'mohmal.com', 'mt2015.com',
  'mytemp.email', 'mytrashmail.com',
  'nomail.xl.cx', 'nospam.ze.tc',
  'owlpic.com', 'proxymail.eu',
  'rcpt.at', 'reallymymail.com',
  'rhyta.com', 'rklips.com',
  'safersignup.de', 'safetymail.info',
  'spambox.us', 'spamcero.com', 'spamfree24.org',
  'superrito.com', 'suremail.info',
  'teleworm.us', 'tempemail.net', 'tempinbox.com',
  'tempmailer.com', 'tempmailaddress.com',
  'temporaryemail.net', 'temporarymail.org',
  'thankyou2010.com', 'thisisnotmyrealemail.com',
  'trash-mail.at', 'trashymail.com', 'trashymail.net',
  'trbvm.com', 'trbvn.com',
  'uggsrock.com', 'upliftnow.com',
  'venompen.com', 'veryreallyme.com',
  'viditag.com', 'vubby.com',
  'whatpaas.com', 'wuzup.net', 'wuzupmail.net',
  'xagloo.com', 'xemaps.com',
  'xents.com', 'xjoi.com',
  'xoxy.net', 'yapped.net',
  'zapto.org', 'zoemail.org',
  'mailnull.com', 'mailscrap.com', 'mailseal.de',
  'mailshell.com', 'mailslurp.com', 'mailtemp.info',
  'mailtothis.com', 'mailzilla.com', 'mailzilla.org',
  'anonymbox.com', 'antichef.com', 'antichef.net',
  'binkmail.com', 'bobmail.info', 'bofthew.com',
  'brefmail.com', 'bugmenot.com', 'bumpymail.com',
  'cellurl.com', 'chogmail.com', 'choicemail1.com',
  'clipmail.eu', 'coldemail.info', 'cool.fr.nf',
  'correo.blogos.net', 'cosmorph.com', 'courriel.fr.nf',
  'crapmail.org', 'crazymailing.com', 'cubiclink.com',
  'curryworld.de', 'cust.in', 'dacoolest.com',
  'dandikmail.com', 'dayrep.com', 'dcemail.com',
  'deadaddress.com', 'despammed.com', 'devnullmail.com',
  'dfgh.net', 'digitalsanctuary.com', 'dingbone.com',
  'discard.email', 'discardmail.com', 'discardmail.de',
  'disposableaddress.com', 'disposeamail.com', 'dm.w3internet.co.uk',
  'dodgeit.com', 'dodgit.com', 'donemail.ru',
  'dontreg.com', 'dontsendmespam.de', 'drdrb.com',
  'dump-email.info', 'dumpandjunk.com', 'dumpmail.de',
  'dumpyemail.com', 'e4ward.com', 'easytrashmail.com',
  'einrot.com', 'email60.com', 'emailgo.de',
  'emailias.com', 'emailigo.de', 'emailinfive.com',
  'emaillime.com', 'emailmiser.com', 'emailproxsy.com',
  'emailresort.com', 'emailsensei.com', 'emailtemporario.com.br',
  'emailto.de', 'emailwarden.com', 'emailx.at.hm',
  'emailxfer.com', 'emz.net', 'enterto.com',
  'ephemail.net', 'etranquil.com', 'etranquil.net',
  'evopo.com', 'explodemail.com', 'express.net.ua',
  'eyepaste.com', 'fastacura.com', 'fastchevy.com',
  'fastchrysler.com', 'fastkawasaki.com', 'fastmazda.com',
  'fastmitsubishi.com', 'fastnissan.com', 'fastsubaru.com',
  'fastsuzuki.com', 'fasttoyota.com',
  '10minutemail.com', '10minutemail.co.za', '20minutemail.com',
  'mailhazard.com', 'mailhazard.us', 'mailhz.me',
  'mailimate.com', 'mailincubator.com', 'mailismagic.com',
]);

// Additional pattern-based checks
const DISPOSABLE_PATTERNS = [
  /^temp/i,
  /^trash/i,
  /^spam/i,
  /^disposable/i,
  /^throwaway/i,
  /^fake/i,
  /^junk/i,
  /minute.*mail/i,
  /mail.*temp/i,
  /guerrilla/i,
];

/**
 * Check if an email uses a disposable/temporary domain
 */
export function isDisposableEmail(email: string): boolean {
  if (!email || !email.includes('@')) return false;

  const domain = email.split('@')[1]?.toLowerCase().trim();
  if (!domain) return false;

  // Direct domain match
  if (DISPOSABLE_DOMAINS.has(domain)) return true;

  // Pattern-based check on domain
  for (const pattern of DISPOSABLE_PATTERNS) {
    if (pattern.test(domain)) return true;
  }

  return false;
}

/**
 * Validate email format (basic check)
 */
export function isValidEmailFormat(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}
