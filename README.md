**#SISGES - Sistema de Gestión de Solicitudes**
Sistema web desarrollado para la Unidad de Innovación y Transformación Digital del gobierno municipal de Tizayuca, Hidalgo, que permite gestionar, dar seguimiento y validar solicitudes ciudadanas, acuerdos de gabinete y oficios de manera centralizada, eficiente y transparente.

🚀 Funcionalidades principales
Dashboard interactivo con estadísticas y gráficos exportables.

Creación de solicitudes ciudadanas, acuerdos de gabinete y oficios.

Seguimiento en tiempo real con estados personalizados (Pendiente, En Proceso, Verificación, Atendida, Atrasada).

Sistema de roles y permisos para Jefatura de Gabinete, Secretaría Particular y Administradores.

Carga y visualización de documentos (PDF, JPG, PNG, ZIP, RAR) con límite de 10MB.

Procesos de verificación y validación con confirmación modal y registro de motivos de rechazo.

Interfaz responsiva con barra lateral colapsable y diseño adaptable a dispositivos móviles.

🛠️ Tecnologías utilizadas
Frontend: HTML, CSS, JavaScript

Backend y Base de datos: Firebase (Firestore, Realtime Database, Storage)

Autenticación: Autenticacion con roles diferenciados

Almacenamiento: Firebase Storage para documentos adjuntos

Hosting: Firebase Hosting

📦 Estructura del proyecto
text
sisges/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── auth.js
│   ├── dashboard.js
│   ├── forms.js
│   ├── tracking.js
│   └── firebase.js
├── assets/
│   └── (imágenes e iconos)
└── README.md

📄 Documentación
El sistema cuenta con un Manual Operativo detallado que incluye flujos de trabajo, roles de usuario, estados de solicitudes y procedimientos de validación. Consulte la carpeta /docs o el manual adjunto para más información.

🔐 Roles de usuario
Administradores: Acceso completo a todos los módulos y dependencias.

Jefatura de Gabinete: Gestión exclusiva de acuerdos de gabinete.

Secretaría Particular: Manejo de solicitudes ciudadanas y oficios.

📋 Requisitos de uso
Navegador web moderno (Chrome, Firefox, Edge, Safari)

Conexión a internet

Cuenta de usuario autorizada por el administrador del sistema

🌐 Despliegue
El sistema está diseñado para desplegarse en Firebase Hosting, con configuración de reglas de seguridad en Firestore y Storage para garantizar el acceso segmentado por dependencia y rol.
