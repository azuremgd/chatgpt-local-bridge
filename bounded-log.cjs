const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {Writable}=require('node:stream');

function boundedLog(directory,name,maxBytes=1024*1024,retained=10) {
  if(!['devspace','tunnel'].includes(name)) throw Error('Unknown log source');
  const pattern=new RegExp(`^console-${name}-[0-9TZ.\\-a-f]+\\.log$`,'i');
  const old=fs.readdirSync(directory).filter(file=>pattern.test(file)).map(file=>({file,time:fs.lstatSync(path.join(directory,file)).mtimeMs})).sort((a,b)=>b.time-a.time);
  for(const {file} of old.slice(retained-1)) fs.unlinkSync(path.join(directory,file));
  const file=path.join(directory,`console-${name}-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}.log`);
  const fd=fs.openSync(file,'wx');
  let written=0,closed=false;
  const close=()=>{if(!closed){closed=true;fs.closeSync(fd);}};
  return new Writable({
    write(chunk,_encoding,callback) {
      try {
        const bytes=chunk.subarray(0,Math.max(0,maxBytes-written));
        if(bytes.length) written+=fs.writeSync(fd,bytes);
        callback();
      } catch(error){callback(error);}
    },
    final(callback){try{close();callback();}catch(error){callback(error);}},
    destroy(error,callback){try{close();callback(error);}catch(failure){callback(failure);}}
  });
}
module.exports={boundedLog};
