const cheerio = require('cheerio');

async function testFetch() {
    try {
        const page = 1;
        const res = await fetch(`https://booth.pm/en/search/%E3%82%AA%E3%83%AA%E3%82%B8%E3%83%8A%E3%83%AB3D%E3%83%A2%E3%83%87%E3%83%AB?category_ids%5B%5D=208&sort=wish&page=${page}`);
        const html = await res.text();
        const $ = cheerio.load(html);
        const items = $('.item-card').toArray();
        console.log(`Found ${items.length} items`);
        let count = 0;
        for (let item of items) {
            const name = $(item).find('.item-card__title').text().trim();
            const url = $(item).find('.item-card__title a').attr('href');
            const image = $(item).find('.item-card__thumbnail-image').attr('src') || $(item).find('.item-card__thumbnail-image').attr('data-original');
            const creator = $(item).find('.item-card__shop-name').text().trim() || 'Unknown';
            if (!name || !url || !image) {
                console.log('Skipped an item due to missing fields', { name, url, image });
                continue;
            }
            count++;
        }
        console.log(`Successfully parsed ${count} items.`);
    } catch (e) {
        console.error(e);
    }
}
testFetch();
