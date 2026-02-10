# IndoBench Backend 🇮🇩

Sebuah alat benchmarking berbasis NestJS yang ditenagai oleh [promptfoo](https://promptfoo.dev/) untuk mengevaluasi Large Language Models (LLM) pada logika, koding, dan pengetahuan budaya Indonesia.

## 🚀 Memulai (Getting Started)

### Prasyarat
- Node.js (disarankan v22 atau lebih baru)
- `npm` atau `pnpm`

### Instalasi

1.  **Instal Dependensi**
    Gunakan flag berikut untuk melewati pemeriksaan *engine* yang ketat jika diperlukan:
    ```bash
    npm install --ignore-scripts --force
    ```

2.  **Konfigurasi Environment**
    Buat file `.env` (salin dari `.env.example`) dan tambahkan API key Anda:
    ```env
    OPENAI_API_KEY=kunci_anda_di_sini
    ANTHROPIC_API_KEY=kunci_anda_di_sini
    ```

3.  **Menjalankan Server**
    ```bash
    # Mode pengembangan
    npm run start:dev
    ```
    Server biasanya berjalan di `http://localhost:3000`.

---

## ⚡ Cara Menjalankan Benchmark

Untuk menjalankan benchmark, kirim request **POST** ke:
`POST http://localhost:3000/benchmark/run`

### Contoh Payload (Soal Indonesia)

Salin dan tempel JSON ini ke Postman atau Insomnia.

> **⚠️ PENTING:** Pastikan Anda menggunakan nama model yang **VALID** (contoh: `gpt-4o`, `claude-3-5-sonnet...`). Nama yang tidak valid akan menyebabkan benchmark *crash* tanpa output.

```json
{
  "batchName": "IndoBench: Tes Logika, Koding & Budaya v1",
  "providers": [
    "openai:gpt-4o",
    "anthropic:claude-3-5-sonnet-20240620"
  ],
  "judgeProviders": [
    "openai:gpt-4o"
  ],
  "tests": [
    {
      "id": "mcq_indo_dev_01",
      "type": "mcq",
      "question": "Apa output dari kode JavaScript berikut?\nconsole.log(1 + '1' - 1);\n\nA. 10\nB. 1\nC. 2\nD. 11",
      "expectedAnswer": "A"
    },
    {
      "id": "mcq_indo_culture_01",
      "type": "mcq",
      "question": "Makanan khas Indonesia yang bahan utamanya adalah daging sapi yang dimasak lama dengan santan dan rempah-rempah hingga kering disebut...\n\nA. Soto\nB. Bakso\nC. Rendang\nD. Gado-gado",
      "expectedAnswer": "C"
    },
    {
      "id": "code_indo_01",
      "type": "code",
      "question": "Buatlah fungsi Python `hitung_vokal` yang menghitung jumlah huruf vokal dalam string.",
      "rubric": "Harus case-insensitive. Menghandle string kosong."
    },
    {
      "id": "essay_indo_01",
      "type": "essay",
      "question": "Jelaskan konsep 'Gotong Royong' dan relevansinya di era modern.",
      "rubric": "Menjelaskan kerja sama komunal dan contoh modern (crowdfunding, open source)."
    }
  ]
}
```

### Dukungan Tipe Tes
*   **`mcq`**: Pilihan Ganda. Sistem secara otomatis menyuntikkan instruksi untuk memaksa jawaban satu huruf (A, B, C, atau D).
*   **`essay`**: Pertanyaan esai terbuka yang dinilai oleh LLM Juri (Judge).
*   **`code`**: Tugas koding yang dinilai oleh LLM Juri berdasarkan rubrik.

---

## 🛠 Pemecahan Masalah (Troubleshooting)

| Masalah | Penyebab | Solusi |
| :--- | :--- | :--- |
| **"No Output" / Skor 0** | Nama model di `providers` tidak valid atau salah ketik. | Cek nama model sesuai dokumentasi resmi provider (misal: gunakan `gpt-4o` bukan `gpt-5`). |
| **Jawaban tertukar / geser** | Masalah *concurrency* atau *mapping*. | Kami telah memperbaiki logika *mapping*. Pastikan Anda menggunakan versi terbaru `benchmark.service.ts`. |
| **Error saat Start/Install** | Ketidakcocokan versi Node.js. | Gunakan `overrides` di `package.json` atau jalankan `npm install --force`. |

## Lisensi
[MIT](LICENSE)
