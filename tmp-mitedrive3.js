const id = 'gPfnhw';
fetch(`https://mitedrive.com/view/${id}`)
  .then(res => res.text())
  .then(html => {
    // Look for <video> or <source> tags
    const sourceMatch = html.match(/<source[^>]+src=["']([^"']+)["']/i);
    if(sourceMatch) console.log('Found source:', sourceMatch[1]);
    
    // Look for API calls in the JS
    const scriptMatch = html.match(/fetch\(['"](.*?)['"]/gi);
    if(scriptMatch) console.log('Found fetch calls:', scriptMatch);
    
    // Check if __NEXT_DATA__ contains a stream link
    const nextData = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
    if(nextData) {
      console.log('NEXT_DATA len:', nextData[1].length);
      if(nextData[1].includes('.mp4')) console.log('.mp4 found in NEXT_DATA');
    }
  }).catch(console.error);
