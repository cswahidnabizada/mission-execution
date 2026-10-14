import { cleanText } from "../../core/http.js";
const CATEGORIES=new Set(['courier_express','general_logistics','freight_carrier','last_mile','moving_transport','temperature_controlled']);
const VEHICLES=new Set(['PKW','KOMBI','TRANSPORTER','SPRINTER','KASTENWAGEN','LKW_7_5','LKW_OVER_7_5','KUEHLFAHRZEUG']);
export function validateExecutorRegistration(body={}){
  const value={
    name:cleanText(body.name,160),countryCode:cleanText(body.countryCode,2).toUpperCase(),registeredCompanyName:cleanText(body.registeredCompanyName,200),
    companyCategory:cleanText(body.companyCategory,64),email:cleanText(body.email,200).toLowerCase(),
    mobile:cleanText(body.mobile,60),description:cleanText(body.description,1200),website:cleanText(body.website,300),
    password:String(body.password||''),workingCities:list(body.workingCities,60,80),workingZipCodes:list(body.workingZipCodes,30,12),
    vehicleTypes:Array.isArray(body.vehicleTypes)?body.vehicleTypes.map(x=>cleanText(x,40)).filter(Boolean):[]
  };
  if(!/^[A-Z]{2}$/.test(value.countryCode))return bad('Select your country');
  if(!value.name||!value.registeredCompanyName||!value.companyCategory||!value.email||!value.mobile||!value.description)return bad('Please complete all required fields');
  if(!/^\S+@\S+\.\S+$/.test(value.email))return bad('Enter a valid email address');
  if(!CATEGORIES.has(value.companyCategory))return bad('Choose a valid company category');
  if(!value.workingCities.length)return bad('Add at least one working city');
  if(!value.workingZipCodes.length||value.workingZipCodes.some(z=>!/^\d{5}$/.test(z)))return bad('Add valid 5-digit working ZIP codes');
  if(!value.vehicleTypes.length||value.vehicleTypes.some(v=>!VEHICLES.has(v)))return bad('Choose at least one valid vehicle type');
  if(value.password.length<12||value.password.length>128)return bad('Password must be 12–128 characters');
  return {valid:true,value};
}
export function validateExecutorProfile(body={}){
  const value={
    name:cleanText(body.name,160),countryCode:cleanText(body.countryCode,2).toUpperCase(),registeredCompanyName:cleanText(body.registeredCompanyName,200),
    companyCategory:cleanText(body.companyCategory,64),mobile:cleanText(body.mobile,60),
    description:cleanText(body.description,1200),website:cleanText(body.website,300),
    workingCities:list(body.workingCities,60,80),workingZipCodes:list(body.workingZipCodes,30,12),
    vehicleTypes:Array.isArray(body.vehicleTypes)?body.vehicleTypes.map(x=>cleanText(x,40)).filter(Boolean):[]
  };
  if(!value.name||!value.registeredCompanyName||!value.companyCategory||!value.mobile||!value.description)return bad('Please complete all required fields');
  if(!CATEGORIES.has(value.companyCategory))return bad('Choose a valid company category');
  if(!value.workingCities.length)return bad('Add at least one working city');
  if(!value.workingZipCodes.length||value.workingZipCodes.some(z=>!/^\d{5}$/.test(z)))return bad('Add valid 5-digit working ZIP codes');
  if(!value.vehicleTypes.length||value.vehicleTypes.some(v=>!VEHICLES.has(v)))return bad('Choose at least one valid vehicle type');
  return {valid:true,value};
}

function list(v,maxItems,maxLen){const raw=Array.isArray(v)?v:String(v||'').split(',');return [...new Set(raw.map(x=>cleanText(x,maxLen)).filter(Boolean))].slice(0,maxItems);}
function bad(error){return {valid:false,error};}
