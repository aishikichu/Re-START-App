async function test() {
    const res = await fetch('https://boothplorer.com/avatars/fetch', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sort: 'popularity', page: 1, limit: 100 })
    });
    const text = await res.text();
    console.log(text.substring(0, 500));
}
test();
