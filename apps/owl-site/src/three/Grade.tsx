// The real-light look (?fx=light, see fx.ts). Loaded only when it is on, so the page without it ships no extra code.
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'

/**
 * The scene is drawn in linear light; only what is brighter than white (the colours fx.ts `hot` pushes over 1) blooms,
 * then Khronos PBR Neutral brings it to the screen. Neutral leaves everything below about 0.76 as drawn, so the signs
 * keep their teal, and turns only the over-bright toward white, the way real neon has a white core and a coloured glow.
 * (ACES pushed orange to yellow and blue to purple; AgX greyed the signs.) A light vignette keeps the eye in the middle.
 */
export default function Grade({ coarse }: { coarse: boolean }) {
  return (
    // The composer draws into its own buffer, so the canvas's antialiasing does not reach it: it multisamples itself.
    <EffectComposer multisampling={coarse ? 0 : 4}>
      <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.3} intensity={0.9} radius={0.7} resolutionScale={coarse ? 0.35 : 0.5} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.3} darkness={0.5} />
    </EffectComposer>
  )
}
