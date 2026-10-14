// Public Supabase configuration (publishable key ONLY; NEVER add secrets).
// Google OAuth provider enabled in Supabase on 2026-10-14; final end-to-end login still requires testing.
window.IID_CONFIG = Object.freeze({
  supabaseUrl: "https://wywrahaqpocueddxmjjq.supabase.co",
  supabasePublishableKey: "sb_publishable_F8_CrtwDngDwWJ_Pda8oUw_-vMMOlYh",
  emailAuthReady: false, // flip true ONLY after redirects and email delivery are configured
  googleAuthReady: true // enabled in Supabase; validate OAuth flow in browser
});
