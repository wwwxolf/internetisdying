// V2 shared browser-side presentation constants.
// The authoritative rules are in the Supabase V2 SQL migration.
export const V2_MAX_TAPS=50;
export const V2_DURATION_SECONDS=10;
export const V2_READY_SECONDS=2;
export const V2_MAX_BONUS=6;
export const V2_HOLD_MS=180;
// Six server-matching bonus tiers; 50 is the only +6% threshold.
export function v2TapBonus(taps){
 const t=Math.max(0,Math.min(V2_MAX_TAPS,Math.floor(Number(taps)||0)));
 if(t>=50)return 6;
 if(t>=42)return 5;
 if(t>=34)return 4;
 if(t>=25)return 3;
 if(t>=17)return 2;
 if(t>=9)return 1;
 return 0;
}
