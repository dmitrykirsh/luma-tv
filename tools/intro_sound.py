"""Звук заставки Luma: тёплый кинематографичный аккорд (~2.8 с).
Только чистые синусы: низкий мягкий удар, плавно нарастающий аккорд Ре мажор с секундой и один тихий колокольчик в конце.
Никаких шумов, пил и неточных обертонов, чтобы звучало мягко и без «скрежета». Синтез, без сторонних сэмплов."""
import numpy as np, subprocess, wave, os

SR = 44100
T = 2.8
n = int(SR * T)
t = np.arange(n) / SR

def lp(x, fc, order=4):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / fc) ** order)
    return np.fft.irfft(X, len(x))

def sm(x0, a, r, curve=1.6):
    """плавная огибающая: нарастание a с, спад r с, начиная с x0"""
    e = np.zeros(n)
    i0 = int(x0 * SR); ia = max(int(a * SR), 1); ir = max(int(r * SR), 1)
    e[i0:i0 + ia] = np.linspace(0, 1, ia) ** curve
    j = i0 + ia
    m = min(ir, n - j)
    e[j:j + m] = np.cos(np.linspace(0, np.pi / 2, m)) ** 2
    return e

# 1. мягкий низкий удар на 0.45 с: чистая синусоида, частота плавно падает 62 → 41 Гц
tb = np.clip(t - 0.45, 0, None)
freq = 41 + 21 * np.exp(-tb * 7)
boom = np.sin(2 * np.pi * np.cumsum(freq) / SR) * sm(0.45, 0.05, 1.5, 1.2) * 0.3

# 2. аккорд: Ре, Ля, Ре, Ми, Фа#, Ля, Ре, Фа#; только синусы, лёгкая расстройка для объёма
notes = [(73.42, 0.3), (110.0, 0.3), (146.83, 0.5), (164.81, 0.25), (185.0, 0.4), (220.0, 0.55), (293.66, 0.5), (369.99, 0.4), (440.0, 0.28), (587.33, 0.16)]
chord = np.zeros(n)
for f, g in notes:
    for det in (-0.0025, 0.0025):
        chord += np.sin(2 * np.pi * f * (1 + det) * t) * g / 2
chord *= sm(0.15, 1.15, 1.45, 1.8)

# 3. тихий колокольчик на кульминации: точные гармоники 1:2:3 (без металлического звона)
bell = np.zeros(n)
for t0, f, g in [(1.25, 659.26, 0.16), (1.55, 987.77, 0.1)]:
    tt = np.clip(t - t0, 0, None)
    w = (np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(2 * np.pi * f * 2 * tt) + 0.08 * np.sin(2 * np.pi * f * 3 * tt)) * np.exp(-tt * 2.6) * (t >= t0)
    w *= np.clip((t - t0) / 0.01, 0, 1)   # без щелчка в начале
    bell += w * g

dry = boom + chord + bell

# мягкая реверберация: затухающий шум, обрезанный по частоте
rng = np.random.default_rng(3)
rl = int(1.4 * SR)
ir = lp(rng.standard_normal(rl), 1800, 2) * np.exp(-np.arange(rl) / (0.4 * SR)); ir[0] = 0
wet = np.fft.irfft(np.fft.rfft(dry, n + rl) * np.fft.rfft(ir, n + rl), n + rl)[:n]
mix = dry * 0.85 + wet * 0.22

# общий срез верхов (до 3.2 кГц)
mix = lp(mix, 3200, 4)
d = int(0.013 * SR)
L = mix + np.concatenate([np.zeros(d), wet[:-d]]) * 0.03
R = mix + np.concatenate([wet[d:], np.zeros(d)]) * 0.03
fade_in = np.clip(t / 0.06, 0, 1)
fade_out = np.clip((T - t) / 0.6, 0, 1) ** 1.5
out = np.stack([L, R], 1) * (fade_in * fade_out)[:, None]
out = out / np.max(np.abs(out)) * 0.16

d = os.path.dirname(os.path.abspath(__file__))
wav = os.path.join(d, 'intro.wav')
with wave.open(wav, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((out * 32767).astype('<i2').tobytes())
dst = os.path.join(d, '..', 'app', 'src', 'main', 'assets', 'intro.mp3')
subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '160k', dst], check=True)
os.remove(wav)
print('ok', os.path.getsize(dst))
