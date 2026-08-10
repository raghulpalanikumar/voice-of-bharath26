'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, type MotionProps, motion } from 'motion/react';
import { useAgent, useSessionContext, useSessionMessages } from '@livekit/components-react';
import { AgentChatTranscript } from '@/components/agents-ui/agent-chat-transcript';
import { TrendingUp, MapPin, Clock, ArrowRight, X } from 'lucide-react';
import {
  AgentControlBar,
  type AgentControlBarControls,
} from '@/components/agents-ui/agent-control-bar';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { cn } from '@/lib/shadcn/utils';
import { TileLayout } from './tile-view';

const MotionMessage = motion.create(Shimmer);

const BOTTOM_VIEW_MOTION_PROPS: MotionProps = {
  variants: {
    visible: {
      opacity: 1,
      translateY: '0%',
    },
    hidden: {
      opacity: 0,
      translateY: '100%',
    },
  },
  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',
  transition: {
    duration: 0.3,
    delay: 0.5,
    ease: 'easeOut',
  },
};

const CHAT_MOTION_PROPS: MotionProps = {
  variants: {
    hidden: {
      opacity: 0,
      transition: {
        ease: 'easeOut',
        duration: 0.3,
      },
    },
    visible: {
      opacity: 1,
      transition: {
        delay: 0.2,
        ease: 'easeOut',
        duration: 0.3,
      },
    },
  },
  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',
};

const SHIMMER_MOTION_PROPS: MotionProps = {
  variants: {
    visible: {
      opacity: 1,
      transition: {
        ease: 'easeIn',
        duration: 0.5,
        delay: 0.8,
      },
    },
    hidden: {
      opacity: 0,
      transition: {
        ease: 'easeIn',
        duration: 0.5,
        delay: 0,
      },
    },
  },
  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',
};

interface FadeProps {
  top?: boolean;
  bottom?: boolean;
  className?: string;
}

export function Fade({ top = false, bottom = false, className }: FadeProps) {
  return (
    <div
      className={cn(
        'from-background pointer-events-none h-4 bg-linear-to-b to-transparent',
        top && 'bg-linear-to-b',
        bottom && 'bg-linear-to-t',
        className
      )}
    />
  );
}

export interface AgentSessionView_01Props {
  /**
   * Message shown above the controls before the first chat message is sent.
   *
   * @default 'Agent is listening, ask it a question'
   */
  preConnectMessage?: string;
  /**
   * Enables or disables the chat toggle and transcript input controls.
   *
   * @default true
   */
  supportsChatInput?: boolean;
  /**
   * Enables or disables camera controls in the bottom control bar.
   *
   * @default true
   */
  supportsVideoInput?: boolean;
  /**
   * Enables or disables screen sharing controls in the bottom control bar.
   *
   * @default true
   */
  supportsScreenShare?: boolean;
  /**
   * Shows a pre-connect buffer state with a shimmer message before messages appear.
   *
   * @default true
   */
  isPreConnectBufferEnabled?: boolean;

  /** Selects the visualizer style rendered in the main tile area. */
  audioVisualizerType?: 'bar' | 'wave' | 'grid' | 'radial' | 'aura';
  /** Primary hex color used by supported audio visualizer variants. */
  audioVisualizerColor?: `#${string}`;
  /** Hue shift intensity used by certain visualizers. */
  audioVisualizerColorShift?: number;
  /** Number of bars to render when `audioVisualizerType` is `bar`. */
  audioVisualizerBarCount?: number;
  /** Number of rows in the visualizer when `audioVisualizerType` is `grid`. */
  audioVisualizerGridRowCount?: number;
  /** Number of columns in the visualizer when `audioVisualizerType` is `grid`. */
  audioVisualizerGridColumnCount?: number;
  /** Number of radial bars when `audioVisualizerType` is `radial`. */
  audioVisualizerRadialBarCount?: number;
  /** Base radius of the radial visualizer when `audioVisualizerType` is `radial`. */
  audioVisualizerRadialRadius?: number;
  /** Stroke width of the wave path when `audioVisualizerType` is `wave`. */
  audioVisualizerWaveLineWidth?: number;
  /** Optional class name merged onto the outer `<section>` container. */
  className?: string;
}

function SpeakerStatus({ state }: { state: string }) {
  let statusText = 'Connected';
  let badgeColor = 'bg-muted/30 border-border/40';
  let pulseColor = 'bg-muted-foreground/40';
  let textColor = 'text-muted-foreground';

  if (state === 'connecting' || state === 'initializing') {
    statusText = 'Secure connection...';
    badgeColor = 'bg-blue-500/10 border-blue-500/20';
    pulseColor = 'bg-blue-500';
    textColor = 'text-blue-600 dark:text-blue-400';
  } else if (state === 'thinking') {
    statusText = 'Samar is thinking...';
    badgeColor = 'bg-amber-500/10 border-amber-500/20';
    pulseColor = 'bg-amber-500';
    textColor = 'text-amber-600 dark:text-amber-400';
  } else if (state === 'listening') {
    statusText = 'Listening to you';
    badgeColor = 'bg-emerald-500/10 border-emerald-500/20';
    pulseColor = 'bg-emerald-500';
    textColor = 'text-emerald-600 dark:text-emerald-400';
  } else if (state === 'speaking') {
    statusText = 'Samar is speaking';
    badgeColor = 'bg-teal-500/10 border-teal-500/20';
    pulseColor = 'bg-teal-500';
    textColor = 'text-teal-600 dark:text-teal-400';
  }

  return (
    <div className="flex justify-center items-center pointer-events-none">
      <div className={cn("flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-semibold tracking-wide uppercase transition-all duration-300 shadow-2xs backdrop-blur-xs", badgeColor)}>
        <span className="relative flex h-2 w-2">
          <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", pulseColor)}></span>
          <span className={cn("relative inline-flex rounded-full h-2 w-2", pulseColor)}></span>
        </span>
        <span className={textColor}>{statusText}</span>
      </div>
    </div>
  );
}

export function AgentSessionView_01({
  preConnectMessage = 'Agent is listening, ask it a question',
  supportsChatInput = true,
  supportsVideoInput = true,
  supportsScreenShare = true,
  isPreConnectBufferEnabled = true,

  audioVisualizerType,
  audioVisualizerColor,
  audioVisualizerColorShift,
  audioVisualizerBarCount,
  audioVisualizerGridRowCount,
  audioVisualizerGridColumnCount,
  audioVisualizerRadialBarCount,
  audioVisualizerRadialRadius,
  audioVisualizerWaveLineWidth,
  ref,
  className,
  ...props
}: React.ComponentProps<'section'> & AgentSessionView_01Props) {
  const session = useSessionContext();
  const { messages } = useSessionMessages(session);
  const [chatOpen, setChatOpen] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { state: agentState } = useAgent();
  const [activeWidget, setActiveWidget] = useState<{
    type: 'exchange_rate' | 'branches';
    data: any;
  } | null>(null);

  useEffect(() => {
    const room = session.room;
    if (!room) return;

    const handleDataReceived = (payload: Uint8Array) => {
      try {
        const text = new TextDecoder().decode(payload);
        const eventData = JSON.parse(text);
        if (eventData.type === 'exchange_rate' || eventData.type === 'branches') {
          setActiveWidget({
            type: eventData.type,
            data: eventData,
          });
        }
      } catch (err) {
        console.error('Error decoding data packet:', err);
      }
    };

    room.on('dataReceived', handleDataReceived);
    return () => {
      room.off('dataReceived', handleDataReceived);
    };
  }, [session.room]);

  const lastMessage = messages.at(-1);

  const controls: AgentControlBarControls = {
    leave: true,
    microphone: true,
    chat: supportsChatInput,
    camera: supportsVideoInput,
    screenShare: supportsScreenShare,
  };

  useEffect(() => {
    const lastMessage = messages.at(-1);
    const lastMessageIsLocal = lastMessage?.from?.isLocal === true;

    if (scrollAreaRef.current && lastMessageIsLocal) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <section
      ref={ref}
      className={cn('bg-background relative z-10 h-full w-full overflow-hidden', className)}
      {...props}
    >
      <Fade top className="absolute inset-x-4 top-0 z-10 h-40" />

      {/* Floating Visual Card Widget */}
      <AnimatePresence>
        {activeWidget && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute top-36 left-1/2 -translate-x-1/2 md:left-auto md:right-8 md:translate-x-0 z-50 w-[90%] max-w-xs md:max-w-sm overflow-hidden rounded-2xl border border-border/50 bg-card/85 p-4 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/85"
          >
            {activeWidget.type === 'exchange_rate' && (
              <ExchangeRateWidget
                data={activeWidget.data}
                onClose={() => setActiveWidget(null)}
              />
            )}
            {activeWidget.type === 'branches' && (
              <BranchesWidget
                data={activeWidget.data}
                onClose={() => setActiveWidget(null)}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Speaker Status Badge */}
      <div className="absolute top-20 left-0 right-0 z-40">
        <SpeakerStatus state={agentState} />
      </div>

      {/* transcript */}
      <div className="absolute top-0 bottom-[135px] flex w-full flex-col md:bottom-[170px]">
        <AnimatePresence>
          {chatOpen && (
            <motion.div
              {...CHAT_MOTION_PROPS}
              className="flex h-full w-full flex-col gap-4 space-y-3 transition-opacity duration-300 ease-out"
            >
              <AgentChatTranscript
                agentState={agentState}
                messages={messages}
                className="mx-auto w-full max-w-2xl [&_.is-user>div]:rounded-[22px] [&>div>div]:px-4 [&>div>div]:pt-40 md:[&>div>div]:px-6"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Tile layout */}
      <TileLayout
        chatOpen={chatOpen}
        audioVisualizerType={audioVisualizerType}
        audioVisualizerColor={audioVisualizerColor}
        audioVisualizerColorShift={audioVisualizerColorShift}
        audioVisualizerBarCount={audioVisualizerBarCount}
        audioVisualizerRadialBarCount={audioVisualizerRadialBarCount}
        audioVisualizerRadialRadius={audioVisualizerRadialRadius}
        audioVisualizerGridRowCount={audioVisualizerGridRowCount}
        audioVisualizerGridColumnCount={audioVisualizerGridColumnCount}
        audioVisualizerWaveLineWidth={audioVisualizerWaveLineWidth}
      />

      {/* Bottom */}
      <motion.div
        {...BOTTOM_VIEW_MOTION_PROPS}
        className="absolute inset-x-3 bottom-0 z-50 md:inset-x-12"
      >
        {/* Live Transcript Subtitle Card (Preview when full chat panel is closed) */}
        {!chatOpen && lastMessage && (
          <div className="pointer-events-none mx-auto w-full max-w-xl px-4 pb-4 text-center">
            <div className="inline-block bg-card/75 dark:bg-card/60 border border-border/40 px-4 py-2.5 rounded-xl shadow-md backdrop-blur-md">
              <p className="text-[10px] uppercase tracking-wider text-primary font-bold mb-1">
                {lastMessage.from?.isLocal ? 'You' : 'Samar'}
              </p>
              <p className="text-sm font-medium text-foreground leading-normal max-h-[64px] overflow-y-auto text-pretty">
                {lastMessage.text}
              </p>
            </div>
          </div>
        )}

        {/* Pre-connect message */}
        {isPreConnectBufferEnabled && (
          <AnimatePresence>
            {messages.length === 0 && (
              <MotionMessage
                key="pre-connect-message"
                duration={2}
                aria-hidden={messages.length > 0}
                {...SHIMMER_MOTION_PROPS}
                className="pointer-events-none mx-auto block w-full max-w-2xl pb-4 text-center text-sm font-semibold"
              >
                {preConnectMessage}
              </MotionMessage>
            )}
          </AnimatePresence>
        )}
        <div className="bg-background relative mx-auto max-w-2xl pb-3 md:pb-12">
          <Fade bottom className="absolute inset-x-0 top-0 h-4 -translate-y-full" />
          <AgentControlBar
            variant="livekit"
            controls={controls}
            isChatOpen={chatOpen}
            isConnected={session.isConnected}
            onDisconnect={session.end}
            onIsChatOpenChange={setChatOpen}
          />
        </div>
      </motion.div>
    </section>
  );
}

interface ExchangeRateWidgetProps {
  data: {
    base: string;
    target: string;
    rate: number;
    amount: number;
    total: number;
    last_update: string;
  };
  onClose: () => void;
}

function ExchangeRateWidget({ data, onClose }: ExchangeRateWidgetProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-border/40 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">Remittance Rates</h4>
            <p className="text-[10px] text-muted-foreground">Live Currency Exchange</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg p-1 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="bg-muted/40 rounded-xl p-3 text-center border border-border/30">
        <div className="flex items-center justify-center gap-3 text-lg font-bold text-foreground">
          <span>{data.amount} {data.base}</span>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-teal-600 dark:text-teal-400">₹{data.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Conversion rate: 1 {data.base} = ₹{data.rate.toFixed(2)} INR
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground justify-center">
        <Clock className="h-3 w-3" />
        <span>As of {data.last_update}</span>
      </div>
    </div>
  );
}

interface Branch {
  name: string;
  address: string;
  hours: string;
  phone: string;
}

interface BranchesWidgetProps {
  data: {
    district: string;
    branches: Branch[];
    chained: boolean;
  };
  onClose: () => void;
}

function BranchesWidget({ data, onClose }: BranchesWidgetProps) {
  return (
    <div className="flex flex-col gap-3 max-h-[300px]">
      <div className="flex items-center justify-between border-b border-border/40 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <MapPin className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">Nearest Branch</h4>
            <p className="text-[10px] text-muted-foreground">
              {data.district} {data.chained && '• Profile Match'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg p-1 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto pr-1 space-y-1.5">
        {data.branches.map((branch, index) => (
          <div
            key={index}
            className="bg-muted/30 hover:bg-muted/50 rounded-xl p-2.5 border border-border/25 transition-all text-xs text-left"
          >
            <div className="font-semibold text-foreground text-[13px]">{branch.name}</div>
            <div className="text-muted-foreground mt-1 leading-normal text-[11px]">{branch.address}</div>
            <div className="flex items-center justify-between mt-2 pt-1 border-t border-border/20 text-[10px] text-muted-foreground">
              <span>⏰ {branch.hours}</span>
              {branch.phone !== 'N/A' && <span>📞 {branch.phone}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
