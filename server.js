const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const PORT = Number(process.env.PORT || 10000);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;
const PUBLIC = path.join(__dirname, "public");

const SERVICES = ["Расслабляющий массаж","Восстановительный массаж","Лечебный массаж","Спортивный массаж","Медовый массаж","Оздоровительный массаж"];
const DURATIONS = [30,60];
const PLACES = ["Эстетело — Пушкино","Клязьминские бани","Выезд на дом"];

function json(res,code,data){res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify(data));}
function body(req){return new Promise((resolve,reject)=>{let s="";req.on("data",c=>{s+=c;if(s.length>1000000)req.destroy()});req.on("end",()=>{try{resolve(JSON.parse(s||"{}"))}catch(e){reject(e)}});req.on("error",reject)})}
function minutes(t){const [h,m]=t.split(":").map(Number);return h*60+m}
function dayOpenClose(date){const d=new Date(`${date}T12:00:00`).getDay();return d===0||d===6?[720,1260]:[1020,1260]}
function validSlot(date,time,duration){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return false;const [open,close]=dayOpenClose(date),s=minutes(time);return s>=open&&s+duration<=close&&s%30===0}
function overlap(a,b){const as=minutes(a.time),ae=as+a.duration,bs=minutes(b.time),be=bs+b.duration;return as<be&&bs<ae}
function auth(req){const h=req.headers.authorization||"";return h.startsWith("Bearer ")&&h.slice(7)===ADMIN_PASSWORD}

async function getBookings(date=null){
  if(!supabase) throw new Error("Database is not configured");
  let q=supabase.from("bookings").select("*").order("date",{ascending:true}).order("time",{ascending:true});
  if(date) q=q.eq("date",date);
  const {data,error}=await q; if(error) throw error; return data||[];
}
async function getBookingConflicts(date,place){
  const {data,error}=await supabase.from("bookings").select("id,date,time,duration,place,status").eq("date",date).eq("place",place).neq("status","cancelled");
  if(error) throw error; return data||[];
}
async function setting(key){
  const {data,error}=await supabase.from("settings").select("value").eq("key",key).maybeSingle();
  if(error) throw error; return data?.value||null;
}
async function setSetting(key,value){
  const {error}=await supabase.from("settings").upsert({key,value},{onConflict:"key"});
  if(error) throw error;
}
async function telegram(method,payload){
  if(!BOT_TOKEN) return {ok:false};
  const r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  return await r.json();
}
async function notify(text){
  const chatId=await setting("telegram_admin_chat_id");
  if(!chatId) return false;
  const r=await telegram("sendMessage",{chat_id:chatId,text});
  return Boolean(r.ok);
}
function bookingText(b){return `🔔 Новая запись\n\n👤 ${b.name}\n📞 ${b.phone}\n\n💆 ${b.service}\n⏱ ${b.duration} минут\n📅 ${b.date}\n🕐 ${b.time}\n📍 ${b.place}\n\nID: ${b.id}`}

async function telegramPoll(){
  if(!BOT_TOKEN||!supabase)return;
  let offset=Number(await setting("telegram_update_offset")||0);
  async function loop(){
    try{
      const r=await telegram("getUpdates",{offset,timeout:25,allowed_updates:["message"]});
      if(r.ok&&Array.isArray(r.result)){
        for(const u of r.result){
          offset=u.update_id+1; await setSetting("telegram_update_offset",String(offset));
          const msg=u.message;
          if(msg?.chat?.id && msg.text?.trim()==="/start"){
            await setSetting("telegram_admin_chat_id",String(msg.chat.id));
            await telegram("sendMessage",{chat_id:msg.chat.id,text:"✅ Бот подключён. Здесь будут приходить новые заявки на массаж."});
          }
        }
      }
    }catch(e){console.error("Telegram polling:",e.message)}
    setTimeout(loop,1000);
  }
  loop();
}

async function route(req,res){
  const u=new URL(req.url,`http://${req.headers.host}`);
  try{
    if(req.method==="GET"&&u.pathname==="/api/config") return json(res,200,{services:SERVICES,durations:DURATIONS,places:PLACES});
    if(req.method==="GET"&&u.pathname==="/api/slots"){
      if(!supabase)return json(res,503,{error:"База данных не настроена"});
      const date=u.searchParams.get("date"),place=u.searchParams.get("place"),duration=Number(u.searchParams.get("duration"));
      if(!date||!place||!DURATIONS.includes(duration))return json(res,400,{error:"Некорректные параметры"});
      const bookings=await getBookingConflicts(date,place),[open,close]=dayOpenClose(date),slots=[];
      for(let m=open;m+duration<=close;m+=30){const time=String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");const c={date,place,duration,time};if(!bookings.some(b=>overlap(b,c)))slots.push(time)}
      return json(res,200,{date,place,duration,slots});
    }
    if(req.method==="POST"&&u.pathname==="/api/bookings"){
      if(!supabase)return json(res,503,{error:"База данных не настроена"});
      const b=await body(req);b.duration=Number(b.duration);b.name=String(b.name||"").trim().slice(0,80);b.phone=String(b.phone||"").trim().slice(0,40);
      if(!SERVICES.includes(b.service)||!DURATIONS.includes(b.duration)||!PLACES.includes(b.place)||!b.name||!b.phone||!validSlot(b.date,b.time,b.duration))return json(res,400,{error:"Проверьте данные записи"});
      const conflicts=await getBookingConflicts(b.date,b.place);
      if(conflicts.some(x=>overlap(x,b)))return json(res,409,{error:"Это время уже занято. Обновите свободные слоты."});
      const id=crypto.randomUUID().slice(0,8), row={id,service:b.service,duration:b.duration,place:b.place,date:b.date,time:b.time,name:b.name,phone:b.phone,status:"new",created_at:new Date().toISOString()};
      const {error}=await supabase.from("bookings").insert(row);if(error)throw error;
      const sent=await notify(bookingText({...row,createdAt:row.created_at}));
      return json(res,201,{ok:true,booking:{id,status:"new"},telegram:sent});
    }
    if(req.method==="GET"&&u.pathname==="/api/admin/bookings"){
      if(!auth(req))return json(res,401,{error:"Unauthorized"});
      return json(res,200,{bookings:await getBookings(u.searchParams.get("date"))});
    }
    if(req.method==="PATCH"&&u.pathname.startsWith("/api/admin/bookings/")){
      if(!auth(req))return json(res,401,{error:"Unauthorized"});
      const id=u.pathname.split("/").pop(),d=await body(req);
      if(!["new","confirmed","cancelled","completed"].includes(d.status))return json(res,400,{error:"Некорректный статус"});
      const {data,error}=await supabase.from("bookings").update({status:d.status,updated_at:new Date().toISOString()}).eq("id",id).select().single();if(error)throw error;
      return json(res,200,{ok:true,booking:data});
    }
    if(req.method==="GET"&&u.pathname==="/api/health")return json(res,200,{ok:true,database:Boolean(supabase)});
    return staticFile(res,u.pathname);
  }catch(e){console.error(e);return json(res,500,{error:"Ошибка сервера"})}
}
function staticFile(res,pth){let p=decodeURIComponent(pth);if(p==="/")p="/index.html";const file=path.normalize(path.join(PUBLIC,p));if(!file.startsWith(PUBLIC))return json(res,403,{error:"Forbidden"});fs.readFile(file,(err,data)=>{if(err)return json(res,404,{error:"Not found"});const ext=path.extname(file),types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".jpg":"image/jpeg",".png":"image/png"};res.writeHead(200,{"Content-Type":types[ext]||"application/octet-stream"});res.end(data)})}
http.createServer(route).listen(PORT,"0.0.0.0",()=>{console.log(`Site listening on ${PORT}`);telegramPoll()});