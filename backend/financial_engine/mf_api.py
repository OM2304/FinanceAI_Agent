import httpx

ELSS_SCHEMES = ['119151', '120480', '110098', '110053', '110019']
SIP_SCHEMES = ['100123', '100349', '103504', '120505']

async def get_latest_nav(scheme_code):
    url = f"https://api.mfapi.in/mf/{scheme_code}"
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        if response.status_code == 200:
            data = response.json()
            return {
                'name': data['meta']['scheme_name'],
                'nav': float(data['data'][0]['nav']) if data['data'] else None
            }
        else:
            return None

async def get_elss_navs():
    navs = {}
    for code in ELSS_SCHEMES:
        info = await get_latest_nav(code)
        if info and info['nav']:
            navs[info['name']] = info['nav']
    return navs

async def get_sip_navs():
    navs = {}
    for code in SIP_SCHEMES:
        info = await get_latest_nav(code)
        if info and info['nav']:
            navs[info['name']] = info['nav']
    return navs