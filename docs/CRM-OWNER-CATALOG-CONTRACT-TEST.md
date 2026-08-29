# CRM Owner Catalog: contrato de prueba

Esta validación protege el DTO público del catálogo de vendedores sin inspeccionar palabras accidentales dentro del ciphertext. Cada elemento debe contener exactamente `displayName`, `ownerRef` y `role`.

La comprobación es estructural y recursiva: rechaza nombres de campo que representen IDs internos o PII, propiedades adicionales y valores reales de fixtures expuestos en campos visibles. `ownerRef` debe cumplir el formato opaco `or1.<iv>.<ciphertext>.<tag>`, usar Base64URL canónico, respetar los tamaños criptográficos publicados y validar correctamente mediante el lector canónico. Tampoco puede ser igual a un ID interno ni contener valores completos de los fixtures.

El arnés usa exclusivamente aleatoriedad determinista inyectada en el proceso de prueba. La semilla de regresión `owner-catalog-seed-000107` demuestra que palabras como `phone`, `email` o `userId` pueden aparecer accidentalmente en un ciphertext válido sin constituir exposición. Otras 1.000 generaciones deterministas cubren el contrato sin modificar el CSPRNG productivo.

Las negativas distinguen claves prohibidas, PII real, PK en texto plano, referencias truncadas o manipuladas, formato inválido, propiedades no publicadas y PII bajo un nombre aparentemente inocente. El contrato runtime y el cifrado productivo permanecen sin cambios.
