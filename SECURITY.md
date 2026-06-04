# Política de seguridad de Noctcom

> Si encuentras una vulnerabilidad, lee esto antes de hacer nada público.

## TL;DR

- 📬 Canal preferido: **[GitHub Private Vulnerability Report](https://github.com/RedderLabs/noctcom/security/advisories/new)** (solo lo ve el equipo)
- ✉️ Alternativa: **security@noctcom.com** (cifra con la PGP de abajo)
- ⏱️ Respuesta inicial: **menos de 72 horas**
- 🤝 Disclosure coordinado: **90 días o cuando publiquemos el parche**
- 🛑 No: pentesting agresivo contra usuarios reales sin permiso explícito

## Qué consideramos una vulnerabilidad

| Severidad | Ejemplos |
|-----------|----------|
| **Crítica** | RCE en backend · bypass de cifrado E2E · acceso al plaintext de archivos ajenos · auth bypass que permita leer cualquier bóveda |
| **Alta** | Privilege escalation · leak de claves privadas wrappeadas · stored XSS con acceso a MK en memoria · IDOR en archivos ajenos |
| **Media** | CSRF en operaciones sensibles · información leak en metadatos · race conditions explotables |
| **Baja** | Reflected XSS sin acceso a sesión · headers de seguridad faltantes · rate limiting bypass no crítico |

> Actualmente ofrecemos crédito público en `HALL_OF_FAME.md`. El programa de recompensas económicas se activará cuando el proyecto cuente con patrocinios o financiación.

## Seguridad continua (CI)

Cada push y cada PR a `main` pasa por un escaneo automático de seguridad
(`.github/workflows/security.yml`), y Dependabot abre PRs con los parches:

- **CodeQL** (`security-extended` + `security-and-quality`) — SAST de JS/TS.
- **Semgrep** — reglas OWASP Top 10, JWT, secretos, TS/JS.
- **OSV-Scanner** y **npm audit** — vulnerabilidades conocidas en dependencias (npm y Cargo).
- **Trivy** — sistema de archivos y Dockerfiles.
- **Gitleaks** — detección de secretos en el historial.
- **Dependabot** — actualizaciones y parches automáticos (npm, Cargo, GitHub Actions).

No sustituye a una auditoría externa (pendiente, ver más abajo), pero mantiene
una línea base verificable en cada commit.

## Qué NO consideramos vulnerabilidad

- Reportes automatizados de scanners sin explotación demostrada
- Falta de headers de seguridad en endpoints no críticos (ya lo sabemos, lo arreglaremos)
- Self-XSS o ataques que requieren acceso físico al dispositivo del usuario
- Ataques de fuerza bruta contra contraseñas de usuarios individuales (es por diseño, Argon2id lo hace caro)
- Quejas sobre nuestro modelo de amenaza (léelo en `docs/THREAT_MODEL.md` — algunas amenazas están explícitamente fuera del scope)
- Bugs en dependencias de terceros con CVE conocida (los actualizamos en cuanto publican el parche; reportarlo no es novedad)

## Cómo reportar

### Opción A — GitHub Security Advisories (preferido)

Abre un [Private Vulnerability Report](https://github.com/RedderLabs/noctcom/security/advisories/new)
en el repo. Solo nuestro equipo lo verá, y queda registro del hilo completo.

Incluye:
- Descripción de la vulnerabilidad
- Pasos para reproducir (commits, payloads, screenshots)
- Impacto estimado
- Tu identidad o pseudónimo (para crédito) y método de contacto preferido

### Opción B — Email (cifrado con PGP)

Escribe a `security@noctcom.com`, **cifrado** con la clave PGP de Julián
Rodríguez / Redder Labs (mantenedor de Noctcom):

```
Fingerprint: A808 2F51 DA6B C86E A9DC  4248 6FD2 E7D2 8876 F025
```

```
-----BEGIN PGP PUBLIC KEY BLOCK-----

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
=rLr1
-----END PGP PUBLIC KEY BLOCK-----
```

## Nuestro compromiso (Safe Harbor)

Si reportas de buena fe siguiendo esta política:

- ✅ **No te demandaremos** bajo CFAA, leyes equivalentes en EU, ni términos de servicio
- ✅ **Trabajaremos contigo** para entender y mitigar el problema rápidamente
- ✅ **Crédito público** cuando publiquemos el parche (a menos que prefieras anonimato)
- ✅ **CVE asignado** si la vulnerabilidad lo merece

## Tu compromiso

- ❌ No exfiltrar datos de usuarios reales más allá de lo necesario para demostrar el bug
- ❌ No degradar el servicio (DoS) durante el testing
- ❌ No hacer público el bug antes del coordinated disclosure
- ❌ No usar la vulnerabilidad para acceso persistente o lateral movement

## Proceso de disclosure coordinado

```
T+0   Reporte recibido → ack automático en <1h
T+72h Triaje completo + severidad asignada → email con plan
T+30d Parche desarrollado y desplegado en staging
T+45d Despliegue en producción
T+90d Disclosure público + CVE + crédito
       (o antes si el parche está estable y validado)
```

Si el bug está siendo explotado activamente, aceleramos. Si necesitas más tiempo para coordinar (porque afecta a otros proyectos), lo acordamos.

## Reconocimiento y colaboración

| Estado | Cuándo |
|--------|--------|
| Hall of fame + crédito público | Disponible ahora |
| Posibilidad de unirte al equipo | Si tu reporte demuestra talento, hablemos |
| Programa formal de recompensas | Cuando haya patrocinios o financiación |
| Auditoría externa | Cuando el proyecto lo permita |

## Hall of fame

| Investigador | Bug | Severidad | Fecha |
|--------------|-----|-----------|-------|
| *(tu nombre podría estar aquí)* | — | — | — |

## Canary statement

```
A día 4 de junio de 2026, Noctcom afirma:
- No hemos recibido ninguna National Security Letter
- No hemos recibido ninguna gag order
- No hemos sido obligados a insertar backdoors
- No hemos cedido claves criptográficas a ninguna autoridad
- Mantenemos control total sobre nuestra infraestructura
```

**Cómo verificar este canary:** debe ir firmado con la clave PGP de arriba
(fingerprint `A808 2F51 DA6B C86E A9DC 4248 6FD2 E7D2 8876 F025`). Verifica la
firma antes de confiar en él. Se actualiza al menos una vez al mes; si lleva
**más de 60 días sin actualizar o con una firma que no valida**, asume que algo
pasó. (La firma se publica junto a este documento en cada actualización del
canary.)

## Contacto general (no de seguridad)

Para bugs no relacionados con seguridad → [GitHub Issues](https://github.com/RedderLabs/noctcom/issues)

Para consultas comerciales → `hello@noctcom.com`

---

*Última revisión: 4 de junio de 2026 · Próxima revisión: 4 de diciembre de 2026*
