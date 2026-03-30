fetch('https://mitedrive.com/file/gPfnhw', {redirect:'manual'})
  .then(r => console.log('/file/:', r.status, r.headers.get('location')))
  .catch(e=>console.log(e.message));

fetch('https://mitedrive.com/d/gPfnhw', {redirect:'manual'})
  .then(r => console.log('/d/:', r.status, r.headers.get('location')))
  .catch(e=>console.log(e.message));

fetch('https://dl.mitedrive.com/gPfnhw', {redirect:'manual'})
  .then(r => console.log('dl.:', r.status, r.headers.get('location')))
  .catch(e=>console.log(e.message));
