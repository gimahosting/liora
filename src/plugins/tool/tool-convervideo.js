import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs-extra'
import { tmpdir } from 'os'
import { join } from 'path'
import { execSync } from 'child_process'

let handler = async (m, { conn, args, usedPrefix, command }) => {
    // Validasi input
    if (!m.quoted && !m.msg.videoMessage) {
        return conn.reply(m.chat, `📱 *Reply video yang ingin dikompres dengan caption:*\n${usedPrefix + command} [quality]\n\n*Kualitas:*\n• low - Kompresi tinggi (ukuran kecil)\n• medium - Standar (recommended)\n• high - Kompresi rendah (kualitas bagus)\n\n*Contoh:* ${usedPrefix + command} medium`, m)
    }

    // Ambil kualitas dari args
    let quality = args[0]?.toLowerCase() || 'medium'
    let qualities = {
        low: { crf: 28, preset: 'veryfast' },
        medium: { crf: 23, preset: 'faster' },
        high: { crf: 18, preset: 'fast' }
    }

    if (!qualities[quality]) {
        quality = 'medium'
    }

    let { crf, preset } = qualities[quality]

    try {
        await conn.reply(m.chat, '📥 *Mendownload video...*', m)

        // Ensure ffmpeg binary available; try system ffmpeg first
        try {
            execSync('ffmpeg -version', { stdio: 'ignore' })
        } catch (e) {
            // Try to use bundled ffmpeg from ffmpeg-static if available
            try {
                const mod = await import('ffmpeg-static')
                const ffmpegPath = mod?.default || mod
                if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)
            } catch (e2) {
                await conn.reply(m.chat, '❌ *ffmpeg tidak ditemukan.*\nPasang `ffmpeg` di sistem atau tambahkan dependency `ffmpeg-static` dan jalankan instalasi dependensi.', m)
                return
            }
        }
        
        // Download video
        let media = await conn.downloadAndSaveMediaMessage(m.quoted || m, 'input_video')
        let inputPath = media
        let outputPath = join(tmpdir(), `compressed_${Date.now()}.mp4`)

        await conn.reply(m.chat, '⚙️ *Mengkompres video...*\n⏰ Proses bisa memakan waktu 1-5 menit tergantung ukuran video', m)

        // Kompresi video
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .outputOptions([
                    `-crf ${crf}`,
                    `-preset ${preset}`,
                    '-c:v libx264',
                    '-c:a aac',
                    '-b:a 128k',
                    '-movflags +faststart'
                ])
                .output(outputPath)
                .on('progress', (progress) => {
                    console.log(`Processing: ${progress.percent}% done`)
                })
                .on('end', resolve)
                .on('error', reject)
                .run()
        })

        // Cek ukuran hasil
        let stats = await fs.stat(outputPath)
        let fileSizeInBytes = stats.size
        let fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2)

        await conn.reply(m.chat, `✅ *Kompresi selesai!*\n📊 Ukuran baru: ${fileSizeInMB} MB\n📤 Mengirim hasil...`, m)

        // Kirim video hasil
        await conn.sendMessage(m.chat, {
            video: { url: outputPath },
            caption: `🎥 *Video Terkompres*\n📊 Kualitas: ${quality.toUpperCase()}\n💾 Ukuran: ${fileSizeInMB} MB`,
            mimetype: 'video/mp4'
        }, { quoted: m })

        // Bersihkan file temporary
        await fs.unlink(inputPath)
        await fs.unlink(outputPath)

    } catch (error) {
        console.error('Error:', error)
        await conn.reply(m.chat, `❌ *Terjadi kesalahan:*\n${error.message}\n\nPastikan:\n• Video tidak terlalu besar (< 50MB)\n• Format video didukung (mp4, mov, avi)\n• Server memiliki resource cukup`, m)
        
        // Bersihkan file jika ada
        try {
            if (fs.existsSync(inputPath)) await fs.unlink(inputPath)
            if (fs.existsSync(outputPath)) await fs.unlink(outputPath)
        } catch (e) {}
    }
}

handler.help = ['compressvideo']
handler.tags = ['tools', 'converter']
handler.command = /^(compress|compressvideo|compres)$/i
handler.limit = true
handler.group = false

export default handler