const $=id=>document.getElementById(id);
const service=$("service"),duration=$("duration"),place=$("place"),date=$("date"),time=$("time"),form=$("form"),msg=$("msg");
const today=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10); date.min=today;

async function init(){
 const c=await fetch("/api/config").then(r=>r.json());
 c.services.forEach(x=>service.add(new Option(x,x)));
 c.durations.forEach(x=>duration.add(new Option(`${x} минут — ${x===30?"1 500":"3 000"} ₽`,x)));
 c.places.forEach(x=>place.add(new Option(x,x)));
}
async function loadSlots(){
 time.innerHTML="<option>Загрузка...</option>"; time.disabled=true;
 if(!date.value||!place.value||!duration.value)return;
 const q=new URLSearchParams({date:date.value,place:place.value,duration:duration.value});
 const r=await fetch("/api/slots?"+q); const d=await r.json();
 time.innerHTML=d.slots.length?'<option value="">Выберите время</option>':"<option value=''>Свободных слотов нет</option>";
 d.slots.forEach(x=>time.add(new Option(x,x))); time.disabled=!d.slots.length;
}
[date,place,duration].forEach(x=>x.addEventListener("change",loadSlots));
form.addEventListener("submit",async e=>{
 e.preventDefault(); msg.hidden=true;
 const payload={service:service.value,duration:Number(duration.value),place:place.value,date:date.value,time:time.value,name:$("name").value.trim(),phone:$("phone").value.trim()};
 const r=await fetch("/api/bookings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
 const d=await r.json();
 msg.hidden=false; msg.className="message "+(r.ok?"ok":"error"); msg.textContent=r.ok?"Заявка принята! Вадим получит уведомление и свяжется с вами для подтверждения.":"Не удалось записать: "+(d.error||"ошибка");
 if(r.ok){form.reset(); time.innerHTML="<option>Сначала выберите дату и место</option>";time.disabled=true;}
});
init();