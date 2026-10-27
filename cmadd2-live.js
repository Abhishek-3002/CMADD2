(async function(){
const WA='918000540156',root=document.getElementById('products');
function el(tag,text,cls){const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x}
try{
 const r=await fetch('/api/products');if(r.ok){
  const data=await r.json();
  (data.products||[]).forEach(p=>{
   const name=String(p.name||'').trim();if(!name)return;
   const card=[...document.querySelectorAll('.product')].find(x=>(x.querySelector('h3')?.textContent||'').trim().toLowerCase()===name.toLowerCase());
   if(card){
    card.style.display=p.active===false?'none':'';
    card.dataset.availability=p.availability||'Contact for Availability';
    let badge=card.querySelector('.availability');if(!badge){badge=el('p',undefined,'availability');badge.style.cssText='font-size:12px;font-weight:700;color:#087f8c;margin:8px 0';card.querySelector('.info')?.insertBefore(badge,card.querySelector('.qtyrow'))}
    badge.textContent=p.availability||'Contact for Availability';return;
   }
   if(p.active===false||!root)return;
   const cardNew=el('article',undefined,'product');cardNew.dataset.name=name+' '+(p.category||'');cardNew.dataset.availability=p.availability||'Contact for Availability';
   const imgBox=el('div',undefined,'imgbox');if(p.image_url){const img=el('img');img.loading='lazy';img.src=p.image_url;img.alt=name;imgBox.append(img)}else{imgBox.append(el('div','💊'));imgBox.firstChild.style.cssText='padding:35px;text-align:center;font-size:38px'}
   const info=el('div',undefined,'info');info.append(el('div',p.category||'Product','brand'),el('h3',name),el('p',p.availability||'Contact for Availability','availability'));
   info.querySelector('.availability').style.cssText='font-size:12px;font-weight:700;color:#087f8c;margin:8px 0';
   const qty=el('div',undefined,'qtyrow');const minus=el('button','−'),number=el('span','1'),plus=el('button','+');minus.onclick=()=>{number.textContent=Math.max(1,Number(number.textContent)-1)};plus.onclick=()=>{number.textContent=Number(number.textContent)+1};qty.append(minus,number,plus);
   const add=el('button','Add to Cart','add');add.onclick=()=>{const n=Number(number.textContent)||1;for(let i=0;i<n;i++)cart[name]=(Number(cart[name])||0)+1;saveCart();updateCount();renderCart();openCart()};info.append(qty,add);cardNew.append(imgBox,info);root.append(cardNew);
  });
 }
 const cr=await fetch('/api/campaigns');if(cr.ok){
  const cd=await cr.json(),campaigns=cd.campaigns||[];
  if(campaigns.length){const hero=document.querySelector('.hero'),section=el('section');section.style.cssText='max-width:1100px;margin:16px auto;padding:0 18px;display:grid;gap:12px';
   campaigns.forEach(c=>{const card=el('div');card.style.cssText='border-radius:16px;overflow:hidden;background:#123b5d;color:white;padding:20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap';
    if(c.banner_url){const img=el('img');img.src=c.banner_url;img.alt='';img.style.cssText='width:140px;max-height:90px;object-fit:cover;border-radius:10px';card.append(img)}
    const text=el('div');text.style.flex='1';text.append(el('h2',c.title),el('p',c.details));card.append(text);const btn=el('button','WhatsApp Enquiry');btn.onclick=()=>{const msg='Hello, please share details for campaign: '+c.title+'\n'+(c.details||'')+'\nPlease confirm product availability.';window.open('https://wa.me/'+WA+'?text='+encodeURIComponent(msg),'_blank','noopener,noreferrer')};card.append(btn);section.append(card)
   });hero?.insertAdjacentElement('afterend',section)
  }
 }
 if(typeof updateCount==='function')updateCount();if(typeof renderCart==='function')renderCart();
}catch(e){console.warn('CMADD2 live catalog unavailable:',e.message)}
})();