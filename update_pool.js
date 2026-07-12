const fs = require('fs');

const hardcodedImages = {
    'Shinra': 'https://booth.pximg.net/c/300x300/4e179e85-cb47-49f3-8f0d-40d6c97ab3bd/i/4707634/00a74d28-3e9a-41df-a550-93a02bbdb6bc_base_resized.jpg',
    'Lasyusha': 'https://booth.pximg.net/c/300x300/0cd5b6cc-521b-426b-a2cc-4993883a93fa/i/4825073/f3d619ed-b413-4318-971a-63d1db970d4c_base_resized.jpg',
    'Lime': 'https://booth.pximg.net/c/300x300/e9a110a1-77e8-422d-afcf-c799a489725f/i/3303685/dcbc32e6-fa1e-4537-b2f7-72ce6d55734a_base_resized.jpg',
    'Imera': 'https://booth.pximg.net/c/300x300/e9a110a1-77e8-422d-afcf-c799a489725f/i/3040745/c01df82a-28e4-4df8-86f7-b5ccdb397e54_base_resized.jpg',
    'Anri': 'https://booth.pximg.net/c/300x300/e9a110a1-77e8-422d-afcf-c799a489725f/i/3203894/399a9b3a-cc9a-4e2b-be26-9f4df7e04044_base_resized.jpg',
    'Kuuta': 'https://booth.pximg.net/c/300x300/e9a110a1-77e8-422d-afcf-c799a489725f/i/1188385/87e1456a-e66b-420d-8531-1572c6ed26ff_base_resized.jpg',
    'Anon': 'https://booth.pximg.net/c/300x300/e9a110a1-77e8-422d-afcf-c799a489725f/i/3564947/72f4f227-2e19-445a-8e2b-ff2b012470f1_base_resized.jpg'
};

const popularBases = [
    { name: 'Maya', url: 'https://kyubihome.booth.pm/items/3390957' },
    { name: 'Kikyo', url: 'https://ponderogen.booth.pm/items/3681787' },
    { name: 'Manuka', url: 'https://jingo1016.booth.pm/items/5058077' },
    { name: 'Selestia', url: 'https://jingo1016.booth.pm/items/4035411' },
    { name: 'Shinra', url: 'https://mio3works.booth.pm/items/4707634' },
    { name: 'Lapwing', url: 'https://kujishift.booth.pm/items/4993931' },
    { name: 'Lasyusha', url: 'https://keenoo.booth.pm/items/4825073' },
    { name: 'Moe', url: 'https://kyubihome.booth.pm/items/4667400' },
    { name: 'Rindo', url: 'https://jingo1016.booth.pm/items/3443188' },
    { name: 'Karin', url: 'https://komado.booth.pm/items/3470989' },
    { name: 'Lime', url: 'https://komado.booth.pm/items/3303685' }, // Using fallback if 404
    { name: 'Sio', url: 'https://chocolatier.booth.pm/items/5650156' },
    { name: 'Mishe', url: 'https://ponderogen.booth.pm/items/1256087' },
    { name: 'Imera', url: 'https://booth.pm/ja/items/3043641' },
    { name: 'Anri', url: 'https://mio3works.booth.pm/items/3203894' },
    { name: 'Grus', url: 'https://booth.pm/ja/items/3190100' },
    { name: 'Mint', url: 'https://komado.booth.pm/items/2258111' },
    { name: 'Milk Re', url: 'https://komado.booth.pm/items/2953391' },
    { name: 'Chise', url: 'https://booth.pm/ja/items/4123536' },
    { name: 'Leefa', url: 'https://hyuuganatu.booth.pm/items/3659436' },
    { name: 'Wolferia', url: 'https://hyuuganatu.booth.pm/items/2709610' },
    { name: 'Kuuta', url: 'https://booth.pm/ja/items/1188385' },
    { name: 'Rusk', url: 'https://komado.booth.pm/items/2559783' },
    { name: 'Anon', url: 'https://koyori-labo.booth.pm/items/3564947' },
    { name: 'Lame', url: 'https://booth.pm/ja/items/4252664' },
    { name: 'Mamehinata', url: 'https://mukumi.booth.pm/items/4340548' }
];

// Random Japanese name generator parts
const firstNames = ['Sakura', 'Kuro', 'Shiro', 'Yuki', 'Aoi', 'Aka', 'Midori', 'Kiiro', 'Sora', 'Riku', 'Umi', 'Hoshi', 'Tsuki', 'Taiyo', 'Hana', 'Mizu', 'Kaze', 'Hikari', 'Yami', 'Tora', 'Ryu', 'Neko', 'Inu', 'Kuma', 'Usagi', 'Kitsune', 'Tanuki', 'Ookami', 'Tori', 'Kana', 'Mio', 'Rei', 'Asuka', 'Shinji', 'Misato', 'Ritsuko', 'Gendo', 'Fuyutsuki', 'Touji', 'Kensuke', 'Hikari', 'PenPen', 'Yui', 'Naoko', 'Kaworu', 'Mari', 'Ryoji'];
const lastNames = ['Model', 'V1', 'V2', 'V3', 'Avatar', 'Base', 'Kit', 'Project', 'Original', 'Concept', 'Design', 'Style', 'Type-A', 'Type-B', 'Custom', 'Standard', 'Premium', 'Lite', 'Pro', 'Max', 'Ultra', 'Plus', 'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

function generateName() {
    return firstNames[Math.floor(Math.random() * firstNames.length)] + ' ' + lastNames[Math.floor(Math.random() * lastNames.length)];
}

async function rebuildPool() {
    let pool = [];

    // 1. Process Popular Avatars (Variants: UR, SR, R)
    for (const base of popularBases) {
        let imageUrl = 'https://placehold.co/400x400/png?text=' + encodeURIComponent(base.name);
        try {
            console.log(`Fetching ${base.name}...`);
            const res = await fetch(base.url);
            const html = await res.text();
            
            const match = html.match(/<meta property="og:image" content="([^"]+)"/);
            if (match && match[1]) {
                imageUrl = match[1];
                console.log(`Found image for ${base.name}`);
            } else if (hardcodedImages[base.name]) {
                imageUrl = hardcodedImages[base.name];
                console.log(`Used hardcoded image for ${base.name}`);
            } else {
                console.log(`Could not find og:image for ${base.name}, using placeholder.`);
            }
        } catch (e) {
            if (hardcodedImages[base.name]) {
                imageUrl = hardcodedImages[base.name];
                console.log(`Used hardcoded image for ${base.name} (fallback from error)`);
            } else {
                console.error(`Error fetching ${base.name}`);
            }
        }
        
        // Add UR Variant
        pool.push({
            id: base.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '_ur',
            name: base.name,
            rarity: 'UR',
            value: 2500,
            image: imageUrl
        });

        // Add SR Variant
        pool.push({
            id: base.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '_sr',
            name: base.name,
            rarity: 'SR',
            value: 1200,
            image: imageUrl
        });

        // Add R Variant
        pool.push({
            id: base.name.toLowerCase().replace(/[^a-z0-9]/g, '') + '_r',
            name: base.name,
            rarity: 'R',
            value: 600,
            image: imageUrl
        });
    }

    // 2. Generate 2000 Common (C) Avatars
    console.log("Generating 2000 Common avatars...");
    for (let i = 1; i <= 2000; i++) {
        let name = generateName();
        // Give it a slightly unique name if it conflicts
        name = name + (Math.random() > 0.5 ? ' ' + Math.floor(Math.random() * 100) : '');

        let imageUrl = 'https://placehold.co/400x400/png?text=' + encodeURIComponent(name);

        pool.push({
            id: 'generic_' + i,
            name: name,
            rarity: 'C',
            value: 100,
            image: imageUrl
        });
    }

    // Sort pool by value descending
    pool.sort((a, b) => b.value - a.value);

    fs.writeFileSync('gachaPool.json', JSON.stringify(pool, null, 4));
    console.log(`Updated gachaPool.json successfully. Total avatars: ${pool.length}`);
}

rebuildPool();
