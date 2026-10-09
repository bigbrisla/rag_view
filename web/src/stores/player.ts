/**
 * The player clock. The whole visualisation is a pure function of
 * (trace, phase, progress), so play, pause, speed and stepping in both
 * directions are just moves of one number, `t`, driven by GSAP's ticker.
 */
import gsap from 'gsap'
import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import { PHASES, phaseDurations } from '@/player/timeline'
import type { Trace } from '@/types/trace'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const usePlayer = defineStore('player', () => {
  const clock = reactive({ t: 0 })
  const playing = ref(false)
  const speed = ref(1)
  const durations = ref<number[]>(PHASES.map(() => 1))
  let pauseAt: number | null = null
  let seekTween: gsap.core.Tween | null = null

  const starts = computed(() => {
    const out: number[] = []
    let acc = 0
    for (const d of durations.value) {
      out.push(acc)
      acc += d
    }
    return out
  })
  const total = computed(() => durations.value.reduce((a, b) => a + b, 0))
  const index = computed(() => {
    const t = clock.t
    for (let i = PHASES.length - 1; i >= 0; i--) if (t >= starts.value[i]) return i
    return 0
  })
  const progress = computed(() =>
    Math.min(1, Math.max(0, (clock.t - starts.value[index.value]) / durations.value[index.value])),
  )
  const phase = computed(() => PHASES[index.value])
  const finished = computed(() => clock.t >= total.value - 1e-6)

  gsap.ticker.add((_time, deltaMs) => {
    if (!playing.value) return
    const next = clock.t + (deltaMs / 1000) * speed.value
    const stop = pauseAt ?? total.value
    if (next >= stop) {
      clock.t = stop
      playing.value = false
      pauseAt = null
    } else {
      clock.t = next
    }
  })

  function load(trace: Trace, opts: { autoplay?: boolean; at?: number } = {}) {
    seekTween?.kill()
    durations.value = phaseDurations(trace)
    pauseAt = null
    if (reducedMotion()) {
      // Without motion, show each phase complete and let the user step.
      clock.t = starts.value[opts.at ?? 0] + durations.value[opts.at ?? 0] - 1e-3
      playing.value = false
      return
    }
    clock.t = opts.at !== undefined ? starts.value[opts.at] : 0
    playing.value = opts.autoplay ?? true
  }

  function play() {
    if (finished.value) clock.t = 0
    pauseAt = null
    playing.value = true
  }

  function pause() {
    playing.value = false
  }

  function toggle() {
    if (playing.value) pause()
    else play()
  }

  /** Play phase i from its start and stop at its end. */
  function playPhase(i: number) {
    const k = Math.max(0, Math.min(PHASES.length - 1, i))
    seekTween?.kill()
    const end = starts.value[k] + durations.value[k] - 1e-3
    if (reducedMotion()) {
      clock.t = end
      playing.value = false
      return
    }
    clock.t = starts.value[k]
    pauseAt = end
    playing.value = true
  }

  function stepForward() {
    playPhase(index.value + 1)
  }

  function stepBack() {
    playPhase(progress.value > 0.25 ? index.value : index.value - 1)
  }

  /** Smoothly scrub to an absolute time (used by the timeline). */
  function seek(t: number) {
    playing.value = false
    pauseAt = null
    seekTween?.kill()
    seekTween = gsap.to(clock, {
      t: Math.max(0, Math.min(total.value, t)),
      duration: reducedMotion() ? 0 : 0.35,
      ease: 'power2.out',
    })
  }

  return {
    clock,
    playing,
    speed,
    durations,
    starts,
    total,
    index,
    progress,
    phase,
    finished,
    load,
    play,
    pause,
    toggle,
    playPhase,
    stepForward,
    stepBack,
    seek,
  }
})
