"use client";

import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { unsplash, type Photo as PhotoData } from "@/content/images";
import { cn } from "@/lib/utils";

const EASE = [0.76, 0, 0.24, 1] as const;

/** Foto editorial en blanco y negro (next/image, optimizada y diferida). */
export function Photo({
  photo,
  sizes,
  priority = false,
  className,
  imgClassName,
}: {
  photo: PhotoData;
  sizes: string;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-sand", className)}>
      <Image
        src={unsplash(photo)}
        alt={photo.alt}
        fill
        sizes={sizes}
        priority={priority}
        quality={75}
        // Capa propia (transform-gpu): el filtro B/N se rasteriza una vez y las animaciones solo mueven la capa.
        className={cn("transform-gpu object-cover grayscale contrast-[1.08]", imgClassName)}
      />
    </div>
  );
}

/**
 * Revelado por cortina al entrar en pantalla + parallax suave al hacer scroll.
 * La imagen arranca ampliada y se asienta mientras la máscara se abre.
 */
export function RevealPhoto({
  photo,
  sizes,
  className,
  parallax = 12,
  delay = 0,
  direction = "up",
}: {
  photo: PhotoData;
  sizes: string;
  className?: string;
  parallax?: number;
  delay?: number;
  direction?: "up" | "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [`-${parallax}%`, `${parallax}%`]);
  const hidden = direction === "up" ? "inset(100% 0 0 0)" : direction === "left" ? "inset(0 100% 0 0)" : "inset(0 0 0 100%)";
  return (
    <motion.div
      ref={ref}
      className={cn("relative overflow-hidden bg-sand", className)}
      initial={reduced ? false : { clipPath: hidden }}
      whileInView={{ clipPath: "inset(0 0 0 0)" }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: 1.4, ease: EASE, delay }}
    >
      <motion.div
        className="absolute inset-[-14%_0] will-change-transform"
        style={reduced ? undefined : { y }}
        initial={reduced ? false : { scale: 1.3 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1], delay }}
      >
        <Image src={unsplash(photo)} alt={photo.alt} fill sizes={sizes} quality={75} className="transform-gpu object-cover grayscale contrast-[1.08]" />
      </motion.div>
    </motion.div>
  );
}
