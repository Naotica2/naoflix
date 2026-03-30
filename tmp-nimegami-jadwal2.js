const fs=require('fs'); fetch('https://nimegami.id/jadwal-rilis/').then(r=>r.text()).then(t=>fs.writeFileSync('nimegami-html.txt', t));
