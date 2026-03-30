const cheerio = require('cheerio');
const fs = require('fs');
const html = fs.readFileSync('nimegami-html.txt', 'utf8');
const $ = cheerio.load(html);
const jadwal = {};
$('div.rilis2').each((i, el) => {
  const day = $(el).find('h2').text().trim();
  const urls = [];
  $(el).find('ul > li > a').each((_, a) => {
    const title = $(a).text().trim();
    const href = $(a).attr('href');
    if (href) {
      const slug = href.replace('https://nimegami.id/', '').replace(/\//g, '');
      urls.push({ title, link: `sanka://detail/${slug}` });
    }
  });
  if (day && urls.length > 0) jadwal[day] = urls;
});
console.log(jadwal);
