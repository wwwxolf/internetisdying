/* Render saved country badges without accepting untrusted markup. */
import {COUNTRIES} from "./countries.js";
export const FLAG_COLORS=["#202938","#f2ead3","#d84b4b","#47b985"];
export function renderCountryBadge(container,profile,make=tag=>document.createElement(tag)){
 container.replaceChildren();
 container.hidden=true;
 const code=profile?.country_code;
 const country=COUNTRIES.find(item=>item.code===code);
 let flag=null;
 if(country){
  flag=make("img");
  flag.src="https://flagcdn.com/w40/"+country.alpha2.toLowerCase()+".png";
  flag.alt="";
  flag.decoding="async";
 }else if(code==="OTH" && /^[0-9A-F]{48}$/.test(profile.custom_flag||"")){
  flag=make("span");
  flag.className="arena-custom-flag";
  for(const digit of profile.custom_flag){
   const value=parseInt(digit,16);
   for(const pixel of [(value>>2)&3,value&3]){
    const cell=make("span");
    cell.style.backgroundColor=FLAG_COLORS[pixel];
    flag.append(cell);
   }
  }
 }else if(code!=="OTH")return;
 if(flag)container.append(flag);
 const label=make("span");
 label.textContent=code;
 container.append(label);
 container.setAttribute("aria-label",country?"Country "+country.name+" ("+code+")":"Custom flag (OTH)");
 container.hidden=false;
}
