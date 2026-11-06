#!/usr/bin/env python
"""Membuka Google Chrome secara otomatis untuk pengujian tampilan oleh agen QA.

Pemakaian:
  python C:/laragon/www/my-office/scripts/qa-chrome.py <url> [--langkah '<json>'] [--foto <nama>]
         [--lebar 1280] [--tinggi 800] [--tahan <detik>] [--sembunyi] [--luar]

Batasan yang membuat skrip ini aman diberi izin tetap:
  - Selalu memakai profil sementara yang bersih: tanpa cookie, tanpa akun yang sedang login, dibuang saat selesai.
  - Hanya membuka alamat lokal (localhost, 127.0.0.1, *.test). Situs luar butuh --luar, yang selalu meminta izin
    pengguna lewat aturan "ask" di playground/.claude/settings.json.
  - Tidak menerima kode: langkah hanya berupa daftar aksi tetap (lihat AKSI).
  - Foto hanya disimpan di C:/laragon/myra-studio/engineering/qa-foto; nama file tidak bisa keluar dari folder itu.

Contoh --langkah:
  [{"aksi":"isi","pilih":"#email","nilai":"a@b.c"},{"aksi":"klik","pilih":"text=Masuk"},
   {"aksi":"tunggu","pilih":".dasbor"},{"aksi":"teks","pilih":"h1"},{"aksi":"foto","nama":"dasbor"}]
"""
import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

FOLDER_FOTO = Path("C:/laragon/myra-studio/engineering/qa-foto")
AKSI = {"buka", "klik", "isi", "tekan", "pilih-opsi", "tunggu", "teks", "foto", "ukuran"}
BATAS_MS = 15_000


def lokal(url):
    """True untuk alamat di komputer ini; about:blank juga aman karena tidak memuat apa pun."""
    if url == "about:blank":
        return True
    u = urlparse(url)
    host = (u.hostname or "").lower()
    return u.scheme in ("http", "https") and (host in ("localhost", "127.0.0.1", "[::1]", "::1") or host.endswith(".test"))


def boleh(url, luar):
    if lokal(url):
        return True
    return luar and urlparse(url).scheme in ("http", "https")


def path_foto(nama):
    """Hanya nama dasar yang dipakai, jadi ../ atau path absolut tidak bisa keluar dari folder foto."""
    dasar = re.sub(r"[^\w.-]", "-", Path(str(nama).replace("\\", "/")).name).strip(".-") or "foto"
    FOLDER_FOTO.mkdir(parents=True, exist_ok=True)
    return FOLDER_FOTO / f"{Path(dasar).stem}.png"


def jalankan(page, langkah, luar):
    a = langkah.get("aksi")
    if a not in AKSI:
        raise ValueError(f'aksi "{a}" tidak dikenal; pilihan: {", ".join(sorted(AKSI))}')
    pilih = langkah.get("pilih")
    if a == "buka":
        if not boleh(langkah["url"], luar):
            raise ValueError(f'alamat di luar lokal ditolak: {langkah["url"]} (butuh --luar)')
        page.goto(langkah["url"], wait_until="load")
    elif a == "klik":
        page.locator(pilih).first.click()
    elif a == "isi":
        page.locator(pilih).first.fill(str(langkah.get("nilai", "")))
    elif a == "tekan":
        page.keyboard.press(langkah["tombol"])
    elif a == "pilih-opsi":
        page.locator(pilih).first.select_option(str(langkah.get("nilai", "")))
    elif a == "tunggu":
        if pilih:
            page.locator(pilih).first.wait_for()
        else:
            page.wait_for_timeout(min(int(langkah.get("ms", 500)), BATAS_MS))
    elif a == "teks":
        return page.locator(pilih).first.inner_text()
    elif a == "foto":
        tujuan = path_foto(langkah.get("nama", "foto"))
        page.screenshot(path=str(tujuan), full_page=bool(langkah.get("penuh", False)))
        return str(tujuan)
    elif a == "ukuran":
        page.set_viewport_size({"width": int(langkah["lebar"]), "height": int(langkah["tinggi"])})
    return None


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    # allow_abbrev=False: singkatan seperti --lu tidak boleh lolos dari aturan "ask" untuk --luar.
    p = argparse.ArgumentParser(description="Membuka Chrome untuk pengujian tampilan oleh agen QA.", allow_abbrev=False)
    p.add_argument("url")
    p.add_argument("--langkah", default="[]", help="daftar aksi dalam JSON")
    p.add_argument("--foto", help="nama foto halaman akhir")
    p.add_argument("--lebar", type=int, default=1280)
    p.add_argument("--tinggi", type=int, default=800)
    p.add_argument("--tahan", type=float, default=0, help="biarkan jendela terbuka N detik sebelum ditutup (maks. 120)")
    p.add_argument("--sembunyi", action="store_true", help="tanpa jendela (headless)")
    p.add_argument("--luar", action="store_true", help="izinkan alamat di luar komputer ini")
    arg = p.parse_args()

    if not boleh(arg.url, arg.luar):
        sys.exit(f"Ditolak: {arg.url} bukan alamat lokal (localhost, 127.0.0.1, *.test). Pakai --luar dan pengguna akan dimintai izin.")
    try:
        daftar = json.loads(arg.langkah)
        if not isinstance(daftar, list):
            raise ValueError("harus berupa daftar")
    except ValueError as e:
        sys.exit(f"--langkah bukan JSON yang benar: {e}")

    hasil = {"url_awal": arg.url, "langkah": [], "galat_konsol": [], "permintaan_gagal": [], "diblokir": []}
    gagal = False
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=arg.sembunyi)
        try:
            # new_context selalu berupa profil sementara: tidak memakai profil Chrome milik pengguna.
            ctx = browser.new_context(viewport={"width": arg.lebar, "height": arg.tinggi})
            page = ctx.new_page()
            page.set_default_timeout(BATAS_MS)
            page.on("console", lambda m: hasil["galat_konsol"].append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: hasil["galat_konsol"].append(str(e)))
            page.on("requestfailed", lambda r: hasil["permintaan_gagal"].append(r.url))

            def jaga(route):
                # Klik atau pengalihan juga tidak boleh membawa halaman ke situs luar tanpa --luar.
                r = route.request
                if r.is_navigation_request() and not boleh(r.url, arg.luar):
                    hasil["diblokir"].append(r.url)
                    route.abort()
                else:
                    route.continue_()

            ctx.route("**/*", jaga)
            try:
                page.goto(arg.url, wait_until="load")
                for i, langkah in enumerate(daftar, 1):
                    keluaran = jalankan(page, langkah, arg.luar)
                    hasil["langkah"].append({"ke": i, "aksi": langkah.get("aksi"), "hasil": keluaran})
                if arg.foto:
                    hasil["foto"] = str(path_foto(arg.foto))
                    page.screenshot(path=hasil["foto"])
            except (PlaywrightError, ValueError, KeyError, TypeError) as e:
                gagal = True
                hasil["galat"] = f"{type(e).__name__}: {str(e).splitlines()[0] if str(e) else ''}"
            hasil["url_akhir"] = page.url
            hasil["judul"] = page.title()
            if arg.tahan and not arg.sembunyi:
                page.wait_for_timeout(min(arg.tahan, 120) * 1000)
        finally:
            browser.close()
    print(json.dumps(hasil, ensure_ascii=False, indent=2))
    sys.exit(1 if gagal else 0)


if __name__ == "__main__":
    main()
