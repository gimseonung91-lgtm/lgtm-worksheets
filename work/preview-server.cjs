const http=require('http'),fs=require('fs'),path=require('path');
http.createServer((req,res)=>{
  if(req.url==='/favicon.ico'){res.writeHead(204);return res.end();}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(fs.readFileSync(path.join(__dirname,'worksheets.special/index.html')));
}).listen(8765,'127.0.0.1',()=>console.log('Preview http://127.0.0.1:8765'));
