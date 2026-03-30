fetch('https://mitedrive.com/view/gPfnhw/').then(r=>r.text()).then(t=>{
    const match = t.match(/<script id=\"__NEXT_DATA__\" type=\"application\/json\">(.+?)<\/script>/);
    if(match) console.log(JSON.parse(match[1]).props.pageProps);
    else console.log('no match')
});
