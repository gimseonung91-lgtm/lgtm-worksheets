const fs=require('fs');
const vm=require('vm');
const assert=require('assert/strict');
const {createCanvas,loadImage,GlobalFonts}=require('C:/Users/khm82/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
GlobalFonts.registerFromPath('C:/Windows/Fonts/malgun.ttf','Malgun Gothic');
GlobalFonts.registerFromPath('C:/Windows/Fonts/malgunbd.ttf','Malgun Gothic');
const scope={document:{createElement:()=>createCanvas(1,1),fonts:[]},console};
const source=fs.readFileSync(__dirname+'/handwriting-engine.js','utf8').split('// HANDWRITING_ENGINE_END')[0];
scope.recognizer=new Function('document',source+'\nreturn handwriting;')(scope.document);
const recognize=scope.recognizer.recognize;
function printed(char,size=84,x=80,y=90,weight=400) {
  const c=createCanvas(320,220),ctx=c.getContext('2d');
  ctx.font=`${weight} ${size}px "Malgun Gothic"`;ctx.textBaseline='middle';ctx.fillText(char,x,y);
  return ctx.getImageData(0,0,320,220);
}
(async()=>{
  let passed=0;
  for(const char of (process.argv.includes('--images-only')?[]:['사','과','가','아','마','선','생','님','원','효','대','1','A'])) {
    for(const size of [45,90,145]) {
      const result=recognize(printed(char,size,145,100,700),char);
      console.log('FONT',char,size,JSON.stringify(result));
      assert.notEqual(result.state,'warn',`correct ${char} size ${size} must not be rejected`);passed++;
    }
  }
  for(const wrong of (process.argv.includes('--debug-image')?[]:['아','가','마','자','차'])) {
    const result=recognize(printed(wrong),'사');
    console.log('WRONG',wrong,'-> 사',JSON.stringify(result));
    assert.equal(result.state,'warn',`${wrong} must not pass as 사`);passed++;
  }
  if(!process.argv.includes('--debug-image'))for(const wrong of ['가','고','괴','괘','구','기']) {
    const result=recognize(printed(wrong),'과');
    console.log('WRONG',wrong,'-> 과',JSON.stringify(result));
    assert.equal(result.state,'warn',`${wrong} must not pass as 과`);passed++;
  }
  const screenshot=await loadImage('C:/Users/khm82/AppData/Local/Temp/codex-clipboard-691f242c-f086-4ee1-9a70-162ffd089a40.png');
  const crops=[
    ['user-sa','사',[885,140,210,145],false],
    ['user-a','사',[885,330,210,150],true],
    ['user-ga','사',[885,515,210,150],true],
    ['user-ma','사',[885,700,210,160],true],
    ['user-a2','사',[885,910,210,155],true],
    ['user-gwa-extra','과',[1510,520,200,165],true],
    ['user-gwa-missing','과',[1510,700,200,165],true],
    ['user-gwa','과',[1510,905,200,160],false],
  ];
  console.log('SCREENSHOT SIZE',screenshot.width,screenshot.height);
  for(const [name,target,[x,y,w,h],wrong] of crops) {
    const c=createCanvas(w,h),ctx=c.getContext('2d');ctx.drawImage(screenshot,x,y,w,h,0,0,w,h);
    const image=ctx.getImageData(0,0,w,h);
    for(let i=0;i<image.data.length;i+=4)image.data[i+3]=(image.data[i]<110&&image.data[i+1]<110&&image.data[i+2]<110)?255:0;
    const result=recognize(image,target);
    if(process.argv.includes('--debug-image') && name===(process.argv.includes('--gwa')?'user-gwa':'user-sa')) {
      const debug=createCanvas(768,512),d=debug.getContext('2d');
      d.fillStyle='#fff';d.fillRect(0,0,768,512);d.fillStyle='#000';
      const a=scope.recognizer.features(image),b=scope.recognizer.features(printed(target));
      console.log('DEBUG_SCORE',scope.recognizer.similarity(a,b),scope.recognizer.similarity(a,b,'x'));
      for(const [offset,f] of [[0,a],[256,b]]) {
        for(const [col,part] of [f,...f.partsX].entries())for(const i of part.points)d.fillRect(col*256+(i%64)*4,offset+Math.floor(i/64)*4,4,4);
      }
      console.log('DEBUG_IMAGE:'+debug.toDataURL());return;
    }
    console.log('SCREENSHOT',name,JSON.stringify(result));
    if(process.argv.includes('--assert-images')) {
      if(wrong)assert.equal(result.state,'warn',name+' should request another try');
      else assert.equal(result.state,'good',name+' should pass');
      passed++;
    }
  }
  console.log('Assertions passed:',passed);
})().catch(e=>{console.error(e);process.exitCode=1;});
