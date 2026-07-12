
const fs = require('fs');

async function scrape() {
    let allAvatars = [];
    
    // Scrape first 3 pages (around 24 avatars per page usually, so ~72 avatars)
    for (let page = 1; page <= 5; page++) {
        console.log(`Scraping page ${page}...`);
        try {
            const res = await fetch(`https://boothplorer.com/avatars?page=${page}`);
            const html = await res.text();
            
            // Regex to find avatar names and images
            // boothplorer avatar cards usually look like:
            // <img src="https://bplorer.b-cdn.net/images/avatars/XXXXX.jpg" alt="Avatar Name">
            // or <a href="/avatar/Kikyo"> ...
            
            const regex = /<img\s+src="([^"]+)"\s+alt="([^"]+)"/g;
            let match;
            while ((match = regex.exec(html)) !== null) {
                const img = match[1];
                let name = match[2];
                // filter out generic alts like "cover" or "thumbnail"
                if (name && name !== 'cover' && name !== 'BOOTHPLORER' && !name.includes('Avatar')) {
                    // avoid duplicates
                    if (!allAvatars.find(a => a.name === name)) {
                        allAvatars.push({
                            name: name.trim(),
                            image: img.trim()
                        });
                    }
                }
            }
        } catch (e) {
            console.error(e);
        }
    }
    
    console.log(`Found ${allAvatars.length} avatars.`);
    fs.writeFileSync('scraped_avatars.json', JSON.stringify(allAvatars, null, 2));
}

scrape();
