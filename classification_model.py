import argparse
import base64
import json
from pathlib import Path
import matplotlib.pyplot as plt
import pytorch_lightning as pl
import torch
import torch.nn as nn
import torch.optim as optim
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
from pytorch_lightning.callbacks import EarlyStopping, ModelCheckpoint
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms, models
from pytorch_grad_cam import GradCAM
from pytorch_grad_cam.utils.image import show_cam_on_image
import numpy as np 
from waitress import serve
import os

API_PORT = 33519
num_classes = 2
cam = GradCAM
device = 'cuda' if torch.cuda.is_available() else 'cpu'

script_dir = os.path.dirname(os.path.realpath(__file__))
save_dir_default = os.path.join(script_dir, "classification_output")
torch.set_float32_matmul_precision('medium')

default_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])


# ---------- PARCHE 1: desactivar activaciones in-place (evita conflictos autograd) ----------
def _disable_inplace_activations(model: nn.Module):
    for m in model.modules():
        # ReLU / ReLU6 / SiLU por si se usan en otros backbones
        if isinstance(m, (nn.ReLU, nn.ReLU6, nn.SiLU)):
            if hasattr(m, "inplace") and m.inplace:
                m.inplace = False
# -------------------------------------------------------------------------------------------


class JSONImageDataset(Dataset):
    def __init__(self, json_path, img_dir, transform=default_transform):
        self.img_dir = Path(img_dir)
        with open(json_path, 'r') as f:
            self.data = json.load(f)
        self.transform = transform

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        img_path = self.img_dir / self.data[idx]['file_name']
        label = self.data[idx]['class_id']
        image = Image.open(img_path).convert('RGB')
        if self.transform:
            image = self.transform(image)
        return image, label


class ImageClassifier(pl.LightningModule):
    def __init__(self, num_classes=num_classes):
        super().__init__()
        self.model = models.resnet18(pretrained=True)
        self.model.fc = nn.Linear(self.model.fc.in_features, num_classes)
        _disable_inplace_activations(self.model)  # <-- PARCHE aplicado aquí
        self.criterion = nn.CrossEntropyLoss()

    def forward(self, x):
        return self.model(x)

    def training_step(self, batch, batch_idx):
        x, y = batch
        y_hat = self(x)
        loss = self.criterion(y_hat, y)
        self.log('train_loss', loss)
        return loss

    def configure_optimizers(self):
        return optim.Adam(self.parameters(), lr=0.001)


def evaluate_model(model, dataloader):
    model.eval()
    correct = 0
    total = 0
    with torch.no_grad():
        for images, labels in dataloader:
            outputs = model.to(device)(images.to(device)).to('cpu')
            _, predicted = torch.max(outputs, 1)
            total += labels.size(0)
            correct += (predicted == labels).sum().item()
    accuracy = correct / total
    print(f"Evaluation Accuracy: {accuracy:.2f}")


def predict_image(model, img_path):
    model.eval()
    image = Image.open(img_path).convert('RGB')
    transformed_image = default_transform(image).unsqueeze(0)  # (1,3,224,224)

    # ---- pytorch-grad-cam setup ----
    target_layers = [model.model.layer4[-1]]  # capa profunda de ResNet18
    with GradCAM(model=model.model, target_layers=target_layers, use_cuda=False) as cam:
        # forward
        with torch.no_grad():
            logits = model(transformed_image)
        pred_cls = int(torch.argmax(logits, dim=1).item())

        # CAM: devuelve (N,H,W) en [0..1]
        grayscale_cam = cam(input_tensor=transformed_image, targets=None)[0]

    # overlay
    overlay = _overlay_cam_on_pil(image, grayscale_cam)

    plt.imshow(overlay)
    plt.axis('off')
    plt.show()



def create_api(model):
    app = Flask(__name__)
    CORS(app, resources={r"/*": {"origins": "*"}})

    @app.route('/predict', methods=['POST'])
    def predict():
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        try:
            image = Image.open(file).convert('RGB')
            transformed_image = default_transform(image).unsqueeze(0)

            cam_extractor = cam(model.model)

            transformed_image = transformed_image.requires_grad_(True)

            with torch.enable_grad():
                output = model(transformed_image).detach()  # evitamos retener grafo innecesario
                # Re-conectar grad sobre una copia para CAM
                output = output.requires_grad_(True)

            _, predicted_class = torch.max(output, 1)

            # ---------- PARCHE 2: clonar scores antes de torchcam ----------
            activation_map = cam_extractor(predicted_class.item(), output.clone())[0]
            # ----------------------------------------------------------------
            cam_extractor.remove_hooks()

            overlay_result = overlay_mask(
                to_pil_image(transformed_image[0]),
                to_pil_image(activation_map, mode='F'),
                alpha=0.5
            )
            overlay_result = resize_overlay(overlay_result, image.size)

            buf = Path(script_dir) / "activation_map.png"
            overlay_result.save(buf)

            with open(buf, "rb") as img_file:
                encoded_image = base64.b64encode(img_file.read()).decode('utf-8')

            return jsonify({
                'predicted_class': int(predicted_class.item()),
                'activation_map': encoded_image
            })
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    return app


def resize_overlay(overlay, original_shape):
    return overlay.resize(original_shape, Image.BILINEAR)


def main():
    global num_classes

    parser = argparse.ArgumentParser(description="Train, evaluate, predict, or run an API using an image classifier.")
    parser.add_argument("-c", "--command", type=str, required=True, choices=["train", "evaluate", "predict", "api"],
                        help="Command to execute.")
    parser.add_argument("-a", "--annotations", type=str, help="Path to JSON file containing images and class IDs.")
    parser.add_argument("-d", "--img_dir", type=str, help="Directory containing images.")
    parser.add_argument("--max_epochs", type=int, default=100, help="Maximum number of training epochs.")
    parser.add_argument("--patience", type=int, default=10, help="Patience for early stopping.")
    parser.add_argument("--save_dir", type=str, default=save_dir_default,
                        help="Directory to save TensorBoard data and checkpoints.")
    parser.add_argument("-i", "--input_image", type=str, help="Path to input image for prediction.")
    parser.add_argument("-w", "--weights", type=str, help="Path to checkpoint for loading weights.")

    args = parser.parse_args()

    if args.command == "train":
        dataset = JSONImageDataset(args.annotations, args.img_dir)
        dataloader = DataLoader(dataset, batch_size=128, shuffle=True)

        num_classes = len(set(item['class_id'] for item in dataset.data))

        if args.weights:
            model = ImageClassifier.load_from_checkpoint(args.weights, num_classes=num_classes)
            _disable_inplace_activations(model.model)  # seguridad extra si viene del ckpt
            print(f"Resuming training from checkpoint: {args.weights}")
        else:
            model = ImageClassifier(num_classes)

        early_stopping = EarlyStopping(monitor='train_loss', patience=args.patience, mode='min')
        checkpoint_callback = ModelCheckpoint(
            dirpath=args.save_dir,
            save_top_k=-1,
            every_n_epochs=2
        )

        trainer = pl.Trainer(
            max_epochs=args.max_epochs,
            callbacks=[early_stopping, checkpoint_callback],
            default_root_dir=args.save_dir
        )

        trainer.fit(model, dataloader)

    elif args.command == "evaluate":
        dataset = JSONImageDataset(args.annotations, args.img_dir)
        dataloader = DataLoader(dataset, batch_size=32, shuffle=False)

        checkpoint_path = args.weights or Path(args.save_dir) / "last.ckpt"
        model = ImageClassifier.load_from_checkpoint(checkpoint_path)
        _disable_inplace_activations(model.model)  # seguridad extra
        evaluate_model(model, dataloader)

    elif args.command == "predict":
        checkpoint_path = args.weights or Path(args.save_dir) / "last.ckpt"
        model = ImageClassifier.load_from_checkpoint(checkpoint_path).to('cpu')
        _disable_inplace_activations(model.model)  # seguridad extra
        predict_image(model, args.input_image)

    elif args.command == "api":
        checkpoint_path = args.weights or Path(args.save_dir) / "last.ckpt"
        model = ImageClassifier.load_from_checkpoint(checkpoint_path).to('cpu')
        _disable_inplace_activations(model.model)  # seguridad extra
        app = create_api(model)
        serve(app, host='0.0.0.0', port=API_PORT)


if __name__ == "__main__":
    main()
