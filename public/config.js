// Public Supabase configuration (publishable key ONLY; NEVER add secrets).
// Google OAuth and Auth redirect URLs still require owner setup in dashboard.
window.IID_CONFIG = Object.freeze({
  supabaseUrl: "https://wywrahaqpocueddxmjjq.supabase.co",
  supabasePublishableKey: "sb_publishable_F8_CrtwDngDwWJ_Pda8oUw_-vMMOlYh",
  emailAuthReady: false, // flip true ONLY after redirects and email delivery are configured
  googleAuthReady: false // flip true ONLY after Google OAuth is configured
});
