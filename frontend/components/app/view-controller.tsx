'use client';

import React, { useEffect, useState } from 'react';
import { useSessionContext } from '@livekit/components-react';
import { useTheme } from 'next-themes';
import { AnimatePresence, motion } from 'motion/react';
import type { AppConfig } from '@/app-config';
import { AgentSessionView_01 } from '@/components/agents-ui/blocks/agent-session-view-01';
import { WelcomeView } from '@/components/app/welcome-view';
import { Loader2, MicOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MotionWelcomeView = motion.create(WelcomeView);
const MotionSessionView = motion.create(AgentSessionView_01);

const VIEW_MOTION_PROPS = {
  variants: {
    visible: { opacity: 1 },
    hidden: { opacity: 0 },
  },
  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',
  transition: {
    duration: 0.4,
    ease: 'easeInOut',
  },
};

interface ViewControllerProps {
  appConfig: AppConfig;
}

export function ViewController({ appConfig }: ViewControllerProps) {
  const { isConnected, start, connectionState, room } = useSessionContext();
  const { resolvedTheme } = useTheme();

  // Custom states
  const [hasCallEnded, setHasCallEnded] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  // Tracks if the user has been connected at least once to determine the "Call Ended" state
  useEffect(() => {
    if (isConnected) {
      setHasCallEnded(true);
      setMicError(null); // Clear errors once connected
    }
  }, [isConnected]);

  // Listen to media device errors (microphone block events)
  useEffect(() => {
    if (!room) return;

    const handleDeviceError = (error: Error) => {
      console.error('Room media device error:', error);
      const errMsg = error.message || '';
      if (
        errMsg.toLowerCase().includes('permission') ||
        errMsg.toLowerCase().includes('allow') ||
        errMsg.toLowerCase().includes('denied') ||
        error.name === 'NotAllowedError'
      ) {
        setMicError('permission_denied');
      } else {
        setMicError('generic_error');
      }
    };

    room.on('mediaDevicesError', handleDeviceError);
    return () => {
      room.off('mediaDevicesError', handleDeviceError);
    };
  }, [room]);

  // Wrapped start function to catch synchronous permission/connection issues
  const handleStartCall = async () => {
    setMicError(null);
    try {
      await start();
    } catch (err: any) {
      console.error('Start call error:', err);
      const errMsg = err?.message || String(err);
      if (
        errMsg.toLowerCase().includes('permission') ||
        errMsg.toLowerCase().includes('allow') ||
        errMsg.toLowerCase().includes('denied') ||
        err?.name === 'NotAllowedError'
      ) {
        setMicError('permission_denied');
      } else {
        setMicError('generic_error');
      }
    }
  };

  const handleStartAgain = () => {
    setHasCallEnded(false);
    handleStartCall();
  };

  // Determine current overall visual state
  const isCurrentlyConnecting = connectionState === 'connecting' || connectionState === 'reconnecting';
  const showCallEndedScreen = !isConnected && !isCurrentlyConnecting && hasCallEnded;
  const showReadyScreen = !isConnected && !isCurrentlyConnecting && !hasCallEnded;

  return (
    <div className="relative flex h-svh w-full items-center justify-center overflow-hidden">
      {/* Microphone Error Modal Overlay */}
      <AnimatePresence>
        {micError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border-border max-w-md rounded-2xl border p-6 text-center shadow-xl"
            >
              <div className="mx-auto bg-destructive/10 text-destructive mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                <MicOff className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold tracking-tight">Microphone Permission Blocked</h2>
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                Bharat Digital Bank voice assistant needs microphone access so Samar can hear you.
              </p>

              <div className="bg-muted mt-4 rounded-xl p-4 text-left text-xs leading-relaxed">
                <p className="font-semibold text-foreground mb-1.5">How to allow access:</p>
                <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
                  <li>Click the padlock icon (🔒) or settings icon on the left of your URL bar.</li>
                  <li>Locate the <strong>Microphone</strong> option.</li>
                  <li>Change the setting from <strong>Block</strong> to <strong>Allow</strong>.</li>
                  <li>Click the Reload button below to update permission.</li>
                </ol>
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <Button
                  onClick={() => window.location.reload()}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground flex w-full items-center justify-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reload and Try Again
                </Button>
                <Button variant="ghost" onClick={() => setMicError(null)} className="w-full text-xs">
                  Cancel
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {/* State 1: Ready Screen */}
        {showReadyScreen && (
          <MotionWelcomeView
            key="welcome-ready"
            {...VIEW_MOTION_PROPS}
            startButtonText={appConfig.startButtonText}
            onStartCall={handleStartCall}
            callEnded={false}
          />
        )}

        {/* State 2: Connecting Screen */}
        {isCurrentlyConnecting && (
          <motion.div
            key="connecting-screen"
            {...VIEW_MOTION_PROPS}
            className="flex flex-col items-center justify-center text-center p-6"
          >
            <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
              <span className="border-primary/20 absolute h-full w-full animate-ping rounded-full border-2" />
              <Loader2 className="text-primary h-10 w-10 animate-spin" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">
              Connecting to Bharat Digital Bank...
            </h2>
            <p className="text-muted-foreground mt-2 max-w-xs text-sm">
              Please wait while we establish a secure encrypted connection.
            </p>
          </motion.div>
        )}

        {/* State 3 & 4: Active Session (Listening / Speaking) */}
        {isConnected && (
          <MotionSessionView
            key="session-view"
            {...VIEW_MOTION_PROPS}
            supportsChatInput={appConfig.supportsChatInput}
            supportsVideoInput={appConfig.supportsVideoInput}
            supportsScreenShare={appConfig.supportsScreenShare}
            isPreConnectBufferEnabled={appConfig.isPreConnectBufferEnabled}
            audioVisualizerType={appConfig.audioVisualizerType}
            audioVisualizerColor={
              resolvedTheme === 'dark'
                ? appConfig.audioVisualizerColorDark
                : appConfig.audioVisualizerColor
            }
            audioVisualizerColorShift={appConfig.audioVisualizerColorShift}
            audioVisualizerBarCount={appConfig.audioVisualizerBarCount}
            audioVisualizerGridRowCount={appConfig.audioVisualizerGridRowCount}
            audioVisualizerGridColumnCount={appConfig.audioVisualizerGridColumnCount}
            audioVisualizerRadialBarCount={appConfig.audioVisualizerRadialBarCount}
            audioVisualizerRadialRadius={appConfig.audioVisualizerRadialRadius}
            audioVisualizerWaveLineWidth={appConfig.audioVisualizerWaveLineWidth}
            className="fixed inset-0"
          />
        )}

        {/* State 5: Call Ended Screen */}
        {showCallEndedScreen && (
          <MotionWelcomeView
            key="welcome-ended"
            {...VIEW_MOTION_PROPS}
            startButtonText={appConfig.startButtonText}
            onStartCall={handleStartCall}
            callEnded={true}
            onStartAgain={handleStartAgain}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
