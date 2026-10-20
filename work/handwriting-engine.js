// HANDWRITING_ENGINE_BEGIN
// Offline, conservative template recognition. A close alternative blocks a correct verdict.
const handwriting = (() => {
  const SIZE = 64, PAD = 7;
  const cache = new Map();
  function features(image, divide = true) {
    let x0 = image.width, y0 = image.height, x1 = -1, y1 = -1, ink = 0;
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] < 64) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y); ink++;
    }
    if (ink < 12 || x1 - x0 < 3 || y1 - y0 < 3) return null;
    const src = document.createElement('canvas');
    src.width = image.width; src.height = image.height;
    src.getContext('2d').putImageData(image, 0, 0);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    // Independent axes tolerate the wide/tall letters children write in rectangular cells.
    ctx.drawImage(src, x0, y0, w, h, PAD, PAD, SIZE - 2 * PAD, SIZE - 2 * PAD);
    const pixels = ctx.getImageData(0, 0, SIZE, SIZE).data;
    const mask = new Uint8Array(SIZE * SIZE);
    for (let i = 0; i < mask.length; i++) mask[i] = pixels[i * 4 + 3] >= 64 ? 1 : 0;
    const holes = countHoles(mask);
    // Zhang–Suen thinning makes pencil thickness independent of the printed font weight.
    const skeleton = mask.slice();
    let changed = true;
    for (let iteration = 0; changed && iteration < SIZE; iteration++) {
      changed = false;
      for (let pass = 0; pass < 2; pass++) {
        const remove = [];
        for (let y = 1; y < SIZE - 1; y++) for (let x = 1; x < SIZE - 1; x++) {
          const i = y * SIZE + x;
          if (!skeleton[i]) continue;
          const n = [skeleton[i-SIZE], skeleton[i-SIZE+1], skeleton[i+1], skeleton[i+SIZE+1], skeleton[i+SIZE], skeleton[i+SIZE-1], skeleton[i-1], skeleton[i-SIZE-1]];
          const count = n.reduce((a,b) => a+b, 0);
          let transitions = 0;
          for (let j=0; j<8; j++) if (!n[j] && n[(j+1)%8]) transitions++;
          if (count < 2 || count > 6 || transitions !== 1) continue;
          if (pass === 0 ? (n[0]*n[2]*n[4] || n[2]*n[4]*n[6]) : (n[0]*n[2]*n[6] || n[0]*n[4]*n[6])) continue;
          remove.push(i);
        }
        for (const i of remove) skeleton[i] = 0;
        changed ||= remove.length > 0;
      }
    }
    // Refit the centre lines: bold printed stems shrink more during thinning than pencil strokes.
    let sx0=SIZE,sy0=SIZE,sx1=0,sy1=0;
    for(let i=0;i<skeleton.length;i++)if(skeleton[i]) {
      sx0=Math.min(sx0,i%SIZE);sx1=Math.max(sx1,i%SIZE);
      sy0=Math.min(sy0,Math.floor(i/SIZE));sy1=Math.max(sy1,Math.floor(i/SIZE));
    }
    const fitted=new Set();
    for(let i=0;i<skeleton.length;i++)if(skeleton[i]) {
      const px=PAD+Math.round((i%SIZE-sx0)*(SIZE-2*PAD-1)/Math.max(1,sx1-sx0));
      const py=PAD+Math.round((Math.floor(i/SIZE)-sy0)*(SIZE-2*PAD-1)/Math.max(1,sy1-sy0));
      fitted.add(py*SIZE+px);
    }
    const points = [...fitted];
    if (points.length < 8) return null;
    const distance = new Float32Array(SIZE * SIZE).fill(100);
    points.forEach(i => { distance[i] = 0; });
    for (let y=0; y<SIZE; y++) for (let x=0; x<SIZE; x++) {
      const i=y*SIZE+x;
      if(x) distance[i]=Math.min(distance[i],distance[i-1]+1);
      if(y) distance[i]=Math.min(distance[i],distance[i-SIZE]+1);
      if(x&&y) distance[i]=Math.min(distance[i],distance[i-SIZE-1]+Math.SQRT2);
      if(x<SIZE-1&&y) distance[i]=Math.min(distance[i],distance[i-SIZE+1]+Math.SQRT2);
    }
    for (let y=SIZE-1; y>=0; y--) for (let x=SIZE-1; x>=0; x--) {
      const i=y*SIZE+x;
      if(x<SIZE-1) distance[i]=Math.min(distance[i],distance[i+1]+1);
      if(y<SIZE-1) distance[i]=Math.min(distance[i],distance[i+SIZE]+1);
      if(x<SIZE-1&&y<SIZE-1) distance[i]=Math.min(distance[i],distance[i+SIZE+1]+Math.SQRT2);
      if(x&&y<SIZE-1) distance[i]=Math.min(distance[i],distance[i+SIZE-1]+Math.SQRT2);
    }
    const result = {points, distance, holes, aspect: w/h, ink};
    if (divide) {
      const split = (axis) => {
        const length = axis === 'x' ? w : h;
        const span = axis === 'x' ? h : w;
        const density = new Array(length).fill(0);
        for (let a=0;a<length;a++) for(let b=0;b<span;b++) {
          const x=x0+(axis==='x'?a:b),y=y0+(axis==='x'?b:a);
          if(image.data[(y*image.width+x)*4+3]>=64)density[a]++;
        }
        let boundary=Math.round(length*0.63),best=Infinity;
        for(let a=Math.round(length*0.38);a<length*0.82;a++) {
          const score=(density[a-1]+density[a]+density[a+1])/span + Math.abs(a/length-0.63)*0.18;
          if(score<best){best=score;boundary=a;}
        }
        const parts=[];
        for(const [from,to] of [[0,boundary],[boundary,length]]) {
          const pc=document.createElement('canvas');pc.width=axis==='x'?to-from:w;pc.height=axis==='y'?to-from:h;
          const pctx=pc.getContext('2d');
          pctx.drawImage(src,x0+(axis==='x'?from:0),y0+(axis==='y'?from:0),pc.width,pc.height,0,0,pc.width,pc.height);
          parts.push(features(pctx.getImageData(0,0,pc.width,pc.height),false));
        }
        return parts.every(Boolean)?parts:null;
      };
      result.partsX=split('x');result.partsY=split('y');
    }
    return result;
  }
  function countHoles(mask) {
    const seen = new Uint8Array(mask.length); let holes = 0;
    for (let start=0; start<mask.length; start++) {
      if(mask[start] || seen[start]) continue;
      const queue=[start]; seen[start]=1; let border=false;
      for(let h=0;h<queue.length;h++) {
        const i=queue[h], x=i%SIZE, y=Math.floor(i/SIZE);
        if(!x || !y || x===SIZE-1 || y===SIZE-1) border=true;
        for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
          const nx=x+dx,ny=y+dy,ni=ny*SIZE+nx;
          if(nx<0 || ny<0 || nx>=SIZE || ny>=SIZE || seen[ni] || mask[ni]) continue;
          seen[ni]=1;queue.push(ni);
        }
      }
      if(!border && queue.length>=12) holes++;
    }
    return holes;
  }
  function similarity(a,b,layout=null) {
    const directed=(from,to) => {
      let sum=0,far=0; const regions=Array.from({length:4},()=>[0,0]);
      for(const i of from.points) {
        const d=Math.max(0,Math.min(10,to.distance[i])-1.25);sum+=d;if(d>4)far++;
        const region=(i%SIZE>=SIZE/2?1:0)+(Math.floor(i/SIZE)>=SIZE/2?2:0);
        regions[region][0]+=d;regions[region][1]++;
      }
      const worst=Math.max(...regions.filter(r=>r[1]>=5).map(r=>r[0]/r[1]));
      return {mean:sum/from.points.length,far:far/from.points.length,worst};
    };
    const ab=directed(a,b),ba=directed(b,a);
    const whole=(ab.mean+ba.mean)*0.5 + (ab.far+ba.far)*1.2 + Math.max(ab.worst,ba.worst)*0.18
      + Math.min(1,Math.abs(Math.log(a.aspect/b.aspect)))*0.15 + Math.abs(a.holes-b.holes)*0.65;
    const key=layout==='x'?'partsX':layout==='y'?'partsY':null;
    if(!key || !a[key] || !b[key])return whole;
    const parts=a[key].map((part,i)=>similarity(part,b[key][i]));
    return Math.min(whole, whole*0.28 + ((parts[0]+parts[1])*0.5)*0.52 + Math.max(...parts)*0.2);
  }
  function candidates(char) {
    const chars=new Set([char]); const code=char.codePointAt(0)-0xac00;
    if(code>=0 && code<11172) {
      const initial=Math.floor(code/588),vowel=Math.floor(code%588/28),final=code%28;
      for(let i=0;i<19;i++) chars.add(String.fromCodePoint(0xac00+i*588+vowel*28+final));
      for(let v=0;v<21;v++) chars.add(String.fromCodePoint(0xac00+initial*588+v*28+final));
      for(let f=0;f<28;f++) chars.add(String.fromCodePoint(0xac00+initial*588+vowel*28+f));
    } else {
      for(const c of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ') chars.add(c);
    }
    return [...chars];
  }
  function templates(char) {
    if(cache.has(char)) return cache.get(char);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=112;
    const ctx=canvas.getContext('2d');
    const fonts=['"Malgun Gothic", sans-serif','"Nanum Gothic", sans-serif'];
    if(document.fonts && [...document.fonts].some(face=>face.family.replace(/["']/g,'')==='Nanum Pen Script' && face.status==='loaded')) fonts.push('"Nanum Pen Script", cursive');
    const result=[];
    for(const font of fonts) for(const weight of [400,700]) {
      ctx.clearRect(0,0,112,112);ctx.fillStyle='#000';ctx.font=`${weight} 84px ${font}`;
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(char,56,56);
      const f=features(ctx.getImageData(0,0,112,112));if(f)result.push(f);
    }
    const syllable=char.codePointAt(0)-0xac00;
    if(syllable>=0&&syllable<11172)for(const balance of [0.57,0.68]) {
      ctx.clearRect(0,0,112,112);
      drawHangul(ctx,syllable,balance);
      const f=features(ctx.getImageData(0,0,112,112));if(f)result.push(f);
    }
    if(cache.size>600)cache.clear();
    cache.set(char,result);return result;
  }
  // Stroke templates cover ordinary hand-printed Hangul, in addition to installed fonts.
  function drawHangul(ctx,code,balance) {
    const initials=['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
    const vowels=['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
    const finals=['','ㄱ','ㄲ','ㄱㅅ','ㄴ','ㄴㅈ','ㄴㅎ','ㄷ','ㄹ','ㄹㄱ','ㄹㅁ','ㄹㅂ','ㄹㅅ','ㄹㅌ','ㄹㅍ','ㄹㅎ','ㅁ','ㅂ','ㅂㅅ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
    const initial=initials[Math.floor(code/588)],vowel=vowels[Math.floor(code%588/28)],final=finals[code%28];
    const paths={
      'ㄱ':[[[.12,.12],[.88,.12],[.88,.9]]],
      'ㄴ':[[[.12,.1],[.12,.88],[.9,.88]]],
      'ㄷ':[[[.9,.12],[.12,.12],[.12,.88],[.9,.88]]],
      'ㄹ':[[[.12,.1],[.88,.1],[.88,.48],[.12,.48],[.12,.9],[.9,.9]]],
      'ㅁ':[[[.12,.12],[.88,.12],[.88,.88],[.12,.88],[.12,.12]]],
      'ㅂ':[[[.12,.08],[.12,.9],[.88,.9],[.88,.08]],[[.12,.46],[.88,.46]]],
      'ㅅ':[[[.52,.06],[.43,.42],[.08,.9]],[[.43,.42],[.92,.9]]],
      'ㅈ':[[[.08,.1],[.92,.1]],[[.53,.1],[.43,.46],[.08,.9]],[[.43,.46],[.92,.9]]],
      'ㅊ':[[[.4,.02],[.59,.02]],[[.08,.24],[.92,.24]],[[.53,.24],[.43,.5],[.08,.96]],[[.43,.5],[.92,.96]]],
      'ㅋ':[[[.12,.1],[.88,.1],[.88,.9]],[[.12,.48],[.88,.48]]],
      'ㅌ':[[[.9,.1],[.12,.1],[.12,.9],[.9,.9]],[[.12,.48],[.88,.48]]],
      'ㅍ':[[[.05,.1],[.95,.1]],[[.05,.9],[.95,.9]],[[.26,.1],[.26,.9]],[[.74,.1],[.74,.9]]],
      'ㅏ':[[[.16,.04],[.16,.96]],[[.16,.5],[.92,.5]]],
      'ㅑ':[[[.16,.04],[.16,.96]],[[.16,.35],[.92,.35]],[[.16,.65],[.92,.65]]],
      'ㅓ':[[[.84,.04],[.84,.96]],[[.08,.5],[.84,.5]]],
      'ㅕ':[[[.84,.04],[.84,.96]],[[.08,.35],[.84,.35]],[[.08,.65],[.84,.65]]],
      'ㅗ':[[[.04,.85],[.96,.85]],[[.5,.08],[.5,.85]]],
      'ㅛ':[[[.04,.85],[.96,.85]],[[.33,.08],[.33,.85]],[[.67,.08],[.67,.85]]],
      'ㅜ':[[[.04,.15],[.96,.15]],[[.5,.15],[.5,.92]]],
      'ㅠ':[[[.04,.15],[.96,.15]],[[.33,.15],[.33,.92]],[[.67,.15],[.67,.92]]],
      'ㅡ':[[[.04,.5],[.96,.5]]], 'ㅣ':[[[.5,.04],[.5,.96]]],
    };
    const doubled={'ㄲ':'ㄱ','ㄸ':'ㄷ','ㅃ':'ㅂ','ㅆ':'ㅅ','ㅉ':'ㅈ'};
    const paired={'ㅐ':'ㅏ','ㅒ':'ㅑ','ㅔ':'ㅓ','ㅖ':'ㅕ'};
    function glyph(c,x,y,w,h) {
      if(doubled[c]) {glyph(doubled[c],x,y,w*.44,h);glyph(doubled[c],x+w*.56,y,w*.44,h);return;}
      if(paired[c]) {glyph(paired[c],x,y,w*.62,h);glyph('ㅣ',x+w*.74,y,w*.26,h);return;}
      if(c==='ㅇ'||c==='ㅎ') {
        if(c==='ㅎ') {line([[.35,.03],[.65,.03]],x,y,w,h);line([[.08,.24],[.92,.24]],x,y,w,h);}
        ctx.beginPath();ctx.ellipse(x+w*.5,y+h*(c==='ㅎ'?.66:.5),w*.4,h*(c==='ㅎ'?.28:.42),0,0,2*Math.PI);ctx.stroke();return;
      }
      for(const p of paths[c]||[])line(p,x,y,w,h);
    }
    function line(points,x,y,w,h) {ctx.beginPath();points.forEach(([px,py],i)=>i?ctx.lineTo(x+px*w,y+py*h):ctx.moveTo(x+px*w,y+py*h));ctx.stroke();}
    ctx.strokeStyle='#000';ctx.lineWidth=3.5;ctx.lineCap=ctx.lineJoin='round';
    const height=final?65:94, width=94, x=9,y=8;
    const combined={'ㅘ':['ㅗ','ㅏ'],'ㅙ':['ㅗ','ㅐ'],'ㅚ':['ㅗ','ㅣ'],'ㅝ':['ㅜ','ㅓ'],'ㅞ':['ㅜ','ㅔ'],'ㅟ':['ㅜ','ㅣ'],'ㅢ':['ㅡ','ㅣ']};
    if(combined[vowel]) {
      const left=width*balance;
      glyph(initial,x,y,left,height*.48);
      glyph(combined[vowel][0],x,y+height*.5,left,height*.3);
      glyph(combined[vowel][1],x+left+width*.08,y,width-left-width*.08,height);
    } else if(['ㅗ','ㅛ','ㅜ','ㅠ','ㅡ'].includes(vowel)) {
      glyph(initial,x,y,width*.9,height*.53);glyph(vowel,x,y+height*.65,width,height*.34);
    } else {
      glyph(initial,x,y,width*balance,height*.88);
      glyph(vowel,x+width*(balance+.08),y,width*(.92-balance),height);
    }
    if(final) {
      if(final.length===2){glyph(final[0],x,83,42,21);glyph(final[1],x+50,83,42,21);}
      else glyph(final,x+4,83,86,21);
    }
  }
  function recognize(image,expected) {
    const input=features(image);
    if(!input) {
      let ink=0;for(let i=3;i<image.data.length;i+=4)if(image.data[i]>=64)ink++;
      return {state:ink<40?'empty':'unsure'};
    }
    const code=expected.codePointAt(0)-0xac00;
    const vowel=Math.floor(code%588/28);
    const layout=code>=0&&code<11172?(code%28!==0 || [8,12,13,17,18].includes(vowel)?'y':'x'):null;
    const ranked=candidates(expected).map(char=>({char,score:Math.min(...templates(char).map(t=>similarity(input,t,layout)))})).sort((a,b)=>a.score-b.score);
    const target=ranked.find(r=>r.char===expected),other=ranked.find(r=>r.char!==expected);
    const margin=other.score-target.score;
    let state='unsure';
    if(target.score<2.7 && margin>0.18)state='good';
    else if((other.score<3.1 && margin < -0.42) || target.score>4.4)state='warn';
    return {state,score:target.score,margin,alternative:other.char,alternativeScore:other.score};
  }
  async function prepare(expected) {
    let count=0;
    for(const char of candidates(expected)) {
      templates(char);
      if(++count%3===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  return {recognize,features,similarity,candidates,prepare,clearCache:()=>cache.clear()};
})();
// HANDWRITING_ENGINE_END

function resetWritingFeedback(cell) {
  cell.classList.remove('cell-good','cell-warn','cell-unsure');
  cell.querySelector('.cell-feedback')?.remove();
  cell.removeAttribute('aria-label');
}
function evaluateStroke(canvas,cell) {
  resetWritingFeedback(cell);
  if(!cell.dataset.expectedChar)return 'empty';
  const result=handwriting.recognize(canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height),cell.dataset.expectedChar);
  canvas.dataset.verdict=result.state;
  if(result.state==='empty')return 'empty';
  const messages={good:'✓ 잘 썼어요',warn:'↻ 다시 써 보세요',unsure:'? 함께 확인해요'};
  cell.classList.add('cell-'+result.state);
  const label=document.createElement('span');label.className='cell-feedback';label.textContent=messages[result.state];
  cell.append(label);cell.setAttribute('aria-label',messages[result.state]);
  return result.state;
}
async function checkWriting() {
  const button=document.getElementById('btn-check-writing');
  button.disabled=true;button.textContent='확인하고 있어요…';
  try {
    await Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,2000))]);
    const counts={good:0,warn:0,unsure:0,empty:0};
    const prepared=new Set();
    for(const canvas of document.querySelectorAll('.cell-canvas')) {
      if(!canvas.isConnected || !tabletActive)return;
      const char=canvas.parentElement.dataset.expectedChar;
      if(!char || canvas.dataset.strokeCount==='0')continue;
      if(!prepared.has(char)) {await handwriting.prepare(char);prepared.add(char);}
      if(!canvas.isConnected || !tabletActive)return;
      counts[evaluateStroke(canvas,canvas.parentElement)]++;
      await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    const total=counts.good+counts.warn+counts.unsure;
    const messages=[];
    if(counts.good)messages.push(`${counts.good}칸은 잘 썼어요.`);
    if(counts.warn)messages.push(`${counts.warn}칸은 글자 모양을 보고 다시 써 보세요.`);
    if(counts.unsure)messages.push(`${counts.unsure}칸은 선생님과 함께 확인해요.`);
    showToast(total?messages.join(' '):'글자를 쓴 뒤 확인을 눌러 주세요.');
  } finally {button.disabled=false;button.textContent='✓ 쓴 글씨 확인';}
}
if(document.fonts?.addEventListener)document.fonts.addEventListener('loadingdone',()=>handwriting.clearCache());
