// Read-only checks. Run with node --env-file=.env test/check-live.mjs.
import assert from 'node:assert/strict';
const url=process.env.SUPABASE_URL;
const headers={apikey:process.env.SUPABASE_PUBLISHABLE_KEY};
const settings=await fetch(url+'/auth/v1/settings',{headers});
assert.equal(settings.status,200);
const auth=await settings.json();
assert.equal(auth.external.email,true,'Email provider must be enabled');
assert.equal(auth.disable_signup,true,'Public signup must be disabled');
const state=await fetch(url+'/rest/v1/woven_state?select=user_id',{headers});
assert.ok([401,403].includes(state.status),'Anonymous access must be denied');
console.log('Live Supabase checks passed: email enabled, public signups disabled, anonymous task access denied.');
