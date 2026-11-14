"""Meta's V-JEPA 2.1 video encoder (March 2026), the encoder only.

Copied from facebookresearch/vjepa2 at commit 204698b45b3712590f06245fbfba32d3be539812 (app/vjepa_2_1/models), MIT
licence (LICENSE in this folder). Changes: imports made relative, so it does not clash with owl-api's own `app`
package, and timm's drop_path (training only) copied into _tensors.py, so it does not need timm, and one einops rearrange written as a permute. The predictor and the
training code are left out: Owl uses the frozen encoder.
"""
