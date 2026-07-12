

async function test() {
    const url = 'https://booth.pximg.net/c/620x620/ed52788c-0b3b-4e38-9ded-1e5797daf0ef/i/1256087/31156a98-56b4-4c63-93e5-ea4df9b35ac9_base_resized.jpg';
    
    const wsrv = 'https://wsrv.nl/?url=' + encodeURIComponent(url);

    try {
        const res = await fetch(wsrv);
        console.log('wsrv.nl status:', res.status, res.statusText);
        
        const res2 = await fetch(url);
        console.log('direct status:', res2.status, res2.statusText);
    } catch (e) {
        console.error(e);
    }
}
test();
