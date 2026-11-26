import Image from "next/image";
import Link from "next/link";
import type { IconType } from "react-icons";
import { HiSparkles } from "react-icons/hi2";
import {
  FaBolt,
  FaRegCalendarAlt,
  FaHeadset,
  FaCarSide,
  FaCommentDots,
  FaPlay,
  FaArrowRight,
  FaPaperPlane,
  FaTimes,
} from "react-icons/fa";

const features: { icon: IconType; label: string }[] = [
  { icon: FaBolt, label: "Instant Responses" },
  { icon: FaRegCalendarAlt, label: "Easy Booking" },
  { icon: FaHeadset, label: "24/7 Support" },
  { icon: FaCarSide, label: "Cars, Tempo & Buses" },
];

export default function ChatbotHero() {
  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-br from-sky-100 via-white to-sky-200">
      {/* Full background image */}
      <Image
        src="/image/bg-chatbot.webp"
        alt=""
        aria-hidden="true"
        fill
        priority
        sizes="100vw"
        className="pointer-events-none -z-20 object-cover object-bottom"
      />

      {/* Soft white overlay so the left-side text stays readable */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-white/90 via-white/50 to-transparent"
      />

      <div className="mx-auto grid max-w-7xl items-center gap-10 px-6 pt-16 pb-48 lg:grid-cols-[1.05fr_0.95fr] lg:pt-20">
        {/* LEFT: copy */}
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-4 py-2 text-sm font-semibold text-green-800">
            <HiSparkles className="h-4 w-4 text-[#03C35E]" />
            Introducing Our AI Chatbot
          </span>

          <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-950 sm:text-5xl xl:text-6xl">
            Your Smart Travel Assistant –{" "}
            <span className="italic text-[#03C35E]">24/7</span> with{" "}
            <span className="italic text-[#03C35E]">Urban</span>{" "}
            <span className="relative italic text-orange-500">
              Cruise
              <svg
                aria-hidden="true"
                viewBox="0 0 200 20"
                className="absolute -bottom-3 left-0 h-3 w-full text-orange-500"
                preserveAspectRatio="none"
              >
                <path
                  d="M2 14 Q100 -6 198 8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
            Get instant answers, book vehicles, check availability and plan your
            journey — anytime, anywhere!
          </p>

          {/* Feature chips */}
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {features.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex flex-col items-center gap-2 rounded-2xl bg-white/80 px-3 py-4 text-center text-sm font-semibold text-slate-800 shadow-md ring-1 ring-slate-100 backdrop-blur"
              >
                <Icon className="h-7 w-7 text-[#03C35E]" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        {/* RIGHT: mascot + phone */}
        <div className="relative mx-auto h-[672px] w-full max-w-xl">
          {/* Mascot */}
          <Image
            src="/image/robot-uc.webp"
            alt="Urban Cruise robot assistant"
            width={420}
            height={560}
            priority
            className="absolute -left-16 bottom-0 z-20 w-80 sm:w-96 lg:w-[450px] h-auto"
          />
        </div>
      </div>

      {/* Fleet row (remove this block if chatbot-bg.webp already shows the cars) */}
      <Image
        src="/image/vehicle-image.png"
        alt="Urban Cruise fleet: sedans, tempo traveller and bus"
        width={1400}
        height={320}
        className="pointer-events-none absolute bottom-6 left-1/2 z-30 w-[900px] max-w-none -translate-x-1/2 lg:left-[58%] lg:w-[1100px]"
      />
    </section>
  );
}
