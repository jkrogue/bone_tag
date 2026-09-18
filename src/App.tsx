import { useEffect } from 'react'
import { Scene } from './three/Scene'
import { installDebugHandle, useGameStore } from './game/state'
import { HoldRing } from './ui/HoldRing'
import { MissHint } from './ui/MissHint'
import { LoadingScreen } from './ui/LoadingScreen'
import { Hud } from './ui/Hud'
import { RoundResult } from './ui/RoundResult'
import { Summary } from './ui/Summary'
import { HowToPlay } from './ui/HowToPlay'
import { NewDayBanner } from './ui/NewDayBanner'
import { useSkeletonStore } from './three/boneRegistry'
import './ui/hold.css'

function App() {
  const ready = useSkeletonStore((state) => state.ready)

  useEffect(() => {
    useGameStore.getState().init()
    installDebugHandle()
  }, [])

  useEffect(() => {
    if (!ready) return
    useGameStore.getState().setAssetsReady()
  }, [ready])

  useEffect(() => {
    const preventGesture = (e: Event) => e.preventDefault()
    document.addEventListener('gesturestart', preventGesture)
    return () => document.removeEventListener('gesturestart', preventGesture)
  }, [])

  return (
    <>
      <Scene />
      <HoldRing />
      <MissHint />
      <LoadingScreen />
      <Hud />
      <RoundResult />
      <Summary />
      <HowToPlay open={false} onClose={() => {}} />
      <NewDayBanner />
    </>
  )
}

export default App
