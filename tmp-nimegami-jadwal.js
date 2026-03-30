const cheerio = require('cheerio');
fetch('https://nimegami.id/jadwal-rilis/')
  .then(r=>r.text())
  .then(html => {
    const $ = cheerio.load(html);
    const schedule = {};
    $('ul.days.list-unstyled').first().children('li').each((i, el) => {
       const day = $(el).find('h2.day-name').text().trim();
       const urls = [];
       $(el).find('table tbody tr').each((_, tr) => {
          const a = $(tr).find('td').first().find('a');
          const title = a.attr('title') || a.text();
          const href = a.attr('href');
          if (title && href) {
             urls.push({ title: title.trim(), link: href });
          }
       });
       if(day && urls.length > 0) schedule[day] = urls;
    });
    console.log(JSON.stringify(schedule, null, 2));
  }).catch(e=>console.log(e.message));
