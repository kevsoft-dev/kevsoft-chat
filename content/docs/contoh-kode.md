---
title: Contoh kode
group: API
order: 12
desc: curl, JavaScript, dan Python.
---
## curl

~~~bash
curl -H "x-api-key: $KEVSOFT_KEY" "https://domainmu.com/api/v1/news?limit=3"
~~~

## JavaScript (Node.js)

~~~js
const res = await fetch("https://domainmu.com/api/v1/news?limit=5", {
  headers: { "x-api-key": process.env.KEVSOFT_KEY },
});
if (!res.ok) throw new Error((await res.json()).error);
const { data } = await res.json();
for (const n of data) console.log(n.title);
~~~

## Python

~~~python
import os, requests

r = requests.get(
    "https://domainmu.com/api/v1/cas",
    params={"sort": "best", "limit": 10},
    headers={"x-api-key": os.environ["KEVSOFT_KEY"]},
    timeout=10,
)
r.raise_for_status()
for c in r.json()["data"]:
    print(c["status"], c["body"])
~~~

## Mengambil semua berita

~~~js
let before = undefined, all = [];
do {
  const url = new URL("https://domainmu.com/api/v1/news");
  url.searchParams.set("limit", "50");
  if (before) url.searchParams.set("before", before);
  const res = await fetch(url, { headers: { "x-api-key": process.env.KEVSOFT_KEY } });
  const page = await res.json();
  all.push(...page.data);
  before = page.next_cursor;
} while (before);
~~~

> [!TIP]
> Simpan key di environment variable seperti `KEVSOFT_KEY`, bukan langsung di kode.
