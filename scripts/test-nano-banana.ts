import { GoogleGenAI } from '@google/genai'
import { writeFileSync } from 'fs'

const ai = new GoogleGenAI({ apiKey: 'AQ.Ab8RN6JH3p5ZCoxJbooor7xW_2wQwor1vEKT3FhlX7knRAXmbg' })

async function main() {
  console.log('Testing gemini-2.5-flash-image (Nano Banana)...')
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: 'Top-down view of a cozy pumpkin farm in autumn. Storybook watercolor style, soft pastel colors, no text.',
      config: { responseModalities: ['IMAGE', 'TEXT'] },
    })

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData) {
        const buf = Buffer.from(part.inlineData.data!, 'base64')
        writeFileSync('/tmp/test-nano-banana.png', buf)
        console.log('OK! Saved to /tmp/test-nano-banana.png, size:', buf.length, 'bytes')
        console.log('mimeType:', part.inlineData.mimeType)
      } else if (part.text) {
        console.log('text:', part.text)
      }
    }
  } catch (e: unknown) {
    const err = e as { message: string; status?: number }
    console.error('FAIL:', err.message)
  }
}

main()
