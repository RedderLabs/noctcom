# Política de seguridad de Noctcom

> Si encuentras una vulnerabilidad, lee esto antes de hacer nada público.

## TL;DR

- 📬 Reporta a: **security@noctcom.com** (cifra con la PGP de abajo)
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

## Qué NO consideramos vulnerabilidad

- Reportes automatizados de scanners sin explotación demostrada
- Falta de headers de seguridad en endpoints no críticos (ya lo sabemos, lo arreglaremos)
- Self-XSS o ataques que requieren acceso físico al dispositivo del usuario
- Ataques de fuerza bruta contra contraseñas de usuarios individuales (es por diseño, Argon2id lo hace caro)
- Quejas sobre nuestro modelo de amenaza (léelo en `docs/THREAT_MODEL.md` — algunas amenazas están explícitamente fuera del scope)
- Bugs en dependencias de terceros con CVE conocida (los actualizamos en cuanto publican el parche; reportarlo no es novedad)

## Cómo reportar

### Opción A — Email cifrado (preferido)

Manda un email a `security@noctcom.com` cifrado con esta clave PGP:

```
-----BEGIN PGP PUBLIC KEY BLOCK-----

[PLACEHOLDER: generar con `gpg --full-generate-key` y pegar el armored block]
Fingerprint: 0000 0000 0000 0000 0000  0000 0000 0000 0000 0000

-----END PGP PUBLIC KEY BLOCK-----
```

Incluye:
- Descripción de la vulnerabilidad
- Pasos para reproducir (commits, payloads, screenshots)
- Impacto estimado
- Tu identidad o pseudónimo (para crédito) y método de contacto preferido

### Opción B — GitHub Security Advisories

Si prefieres no usar PGP: abre un [Private Vulnerability Report](https://github.com/RedderLabs/noctcom/security/advisories/new) en el repo. Solo nuestro equipo lo verá.

### Opción C — Signal

Para casos especialmente sensibles (NSL, gag order, vulnerabilidad in-the-wild):
- Signal handle: **+XX XXX XXX XXX** (rotamos trimestralmente; el actual está en `/canary`)

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

Esta sección se actualiza el primer día de cada mes con la fecha actual firmada con la PGP de seguridad. Si lleva más de 60 días sin actualizar, asume que algo pasó.

```
A día 24 de mayo de 2026, Noctcom afirma:
- No hemos recibido ninguna National Security Letter
- No hemos recibido ninguna gag order
- No hemos sido obligados a insertar backdoors
- No hemos cedido claves criptográficas a ninguna autoridad
- Mantenemos control total sobre nuestra infraestructura

Firmado: [PGP signature]
```

## Contacto general (no de seguridad)

Para bugs no relacionados con seguridad → [GitHub Issues](https://github.com/RedderLabs/noctcom/issues)

Para consultas comerciales → `hello@noctcom.com`

---

*Última revisión: 24 de mayo de 2026 · Próxima revisión: 24 de noviembre de 2026*
