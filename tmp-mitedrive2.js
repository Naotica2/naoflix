const short = 'gPfnhw';
fetch('https://mitedrive.com/api/download/gPfnhw').then(r=>r.json()).catch(e=>e.message).then(console.log);
fetch('https://mitedrive.com/api/file/gPfnhw').then(r=>r.json()).catch(e=>e.message).then(console.log);
