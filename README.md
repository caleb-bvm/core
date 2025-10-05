
# 🧠 CORE — Sistema Inteligente para la Detección Temprana de Cáncer de Mama

**CORE** es un sistema de apoyo al diagnóstico médico basado en **Inteligencia Artificial** y **Deep Learning**, diseñado para detectar masas sospechosas de cáncer de mama en imágenes mamográficas con alta precisión, sensibilidad y velocidad.

Este proyecto busca **complementar la labor del radiólogo**, no sustituirla, proporcionando una herramienta confiable, explicable y accesible que facilite la detección temprana y contribuya a salvar vidas mediante intervenciones oportunas.

---

## 🚀 Objetivo General

Desarrollar un sistema inteligente capaz de analizar mamografías mediante modelos de aprendizaje profundo, ofreciendo resultados confiables y visualmente interpretables para optimizar la eficiencia del diagnóstico médico.

---

## 🎯 Objetivos Específicos

- **Diseñar y entrenar modelos de IA** (Faster R-CNN, YOLO, U-Net) para la detección de masas sospechosas.  
- **Implementar una infraestructura robusta**, integrando bases de datos médicas seguras y APIs de interoperabilidad.  
- **Desarrollar una aplicación web** intuitiva que permita a los profesionales visualizar resultados e interactuar con el sistema.  
- **Incorporar herramientas de IA explicable (XAI)** para generar visualizaciones claras de las zonas detectadas.  
- **Permitir la descarga de reportes PDF** con los resultados de análisis y anotaciones médicas.

---

## 🧩 Arquitectura del Sistema

```

Dataset → Entrenamiento del Modelo (Faster R-CNN / YOLOv8 / U-Net)
↓
Motor de Inferencia (Detectron2 + PyTorch)
↓
WebApp de Resultados (Flask + HTML/CSS/JS)
↓
Chatbot Asistente (OpenAI API + Python)
↓
Reporte Automático (PDF con resultados + Heatmap)

````

---

## 🧠 Base Técnica

- **Lenguaje:** Python 3.10  
- **Frameworks de IA:** PyTorch, Detectron2, YOLOv8  
- **Librerías de procesamiento:** OpenCV, Pandas, NumPy, Matplotlib  
- **Bases de datos:** InBreast, CBIS-DDSM, MIAS  
- **Infraestructura:** GPU NVIDIA con soporte CUDA  
- **Frontend:** HTML5, CSS3 (Material Design 3), JavaScript  
- **Backend Web:** Flask  
- **Asistente IA:** OpenAI API (para interpretación y síntesis de resultados)

---

## ⚙️ Instalación y Ejecución

### 1️⃣ Preparar entorno en Ubuntu (WSL2 recomendado)
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential git python3.10-venv python3-dev \
                    libgl1 libglib2.0-0 libmagic1 ffmpeg pkg-config cmake
````

### 2️⃣ Crear entorno virtual

```bash
python3 -m venv ~/bcd-env
source ~/bcd-env/bin/activate
python -m pip install --upgrade pip wheel setuptools
```

### 3️⃣ Instalar PyTorch con CUDA

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
```

### 4️⃣ Instalar Detectron2 y dependencias

```bash
pip install 'git+https://github.com/facebookresearch/detectron2.git'
pip install -r requirements.txt
```

### 5️⃣ Colocar datasets

```
datasets/
 ├── INbreast/
 ├── CBIS-DDSM/
 └── MIAS/
```

Convertir a formato COCO/YOLO:

```bash
python convert_dataset.py
```

### 6️⃣ Entrenar modelo

```bash
python detectron.py -c train
```

### 7️⃣ Ejecutar la aplicación web

```bash
cd webapp
python web.py
```

Abrir en el navegador:

> [http://127.0.0.1:33517](http://127.0.0.1:33517)

---

## 📊 Resultados y Desempeño

* Precisión de detección superior al **90%** en validación.
* Reducción significativa de **falsos negativos y falsos positivos**.
* Inferencia en tiempo real: **< 1 segundo por imagen**.
* Entrevistas con radiólogos confirmaron su utilidad como herramienta de apoyo clínico.

---

## 🌍 Impacto y Futuro

CORE puede integrarse al sistema de salud mediante APIs seguras y compatibilidad con equipos de mamografía ya existentes.
Su implementación progresiva permitiría realizar **cribados automáticos**, reducir la carga de trabajo de los especialistas y priorizar casos de riesgo.

El siguiente paso es su **validación clínica en hospitales**, con énfasis en ética, privacidad y equidad tecnológica.

---

## 🧾 Créditos

**Instituto Nacional de San Miguel Tepezontes – Tercer Año BTV Desarrollo de Software**

**Autores:**

* Michael Caleb Ortiz Meléndez
* Ana María Pérez Carrillo
* Lessly Alessandra Pascacio Mártir
* Nathaly Ivania Martínez Guerrero
* Brenda Milena Mártir García


---

## 🧠 Referencias

* Organización Mundial de la Salud (OMS) – *Cáncer de mama, 2024*
* Nature Medicine – *Artificial Intelligence for Breast Cancer Screening, 2025*
* Google Health – *AI in Mammography, 2020*
* National Cancer Institute (NCI) – *AI and Cancer, 2024*

---

## 📜 Licencia

Este proyecto es de uso **académico y de investigación**.
No debe emplearse en diagnósticos médicos reales sin la validación previa de profesionales autorizados.

---

## 💗 CORE

> *“Tecnología que salva vidas. IA que inspira confianza.”*

