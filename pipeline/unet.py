"""A small U-Net for flood segmentation of Sentinel-1 before/after pairs."""
import torch
from torch import nn

# Input channels, all backscatter in dB: post VV, post VH, pre VV, pre VH.
IN_CHANNELS = 4
# Kuro Siwo classes.
NO_WATER, PERMANENT_WATER, FLOOD = 0, 1, 2
CLASS_NAMES = ['no water', 'permanent water', 'flood']
INVALID = 255


def normalise(db):
    """dB backscatter -> roughly unit-scale network input. NaN becomes 0 (about -15 dB)."""
    return torch.nan_to_num((db + 15.0) / 10.0, nan=0.0)


def block(cin, cout):
    return nn.Sequential(
        nn.Conv2d(cin, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True),
        nn.Conv2d(cout, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True),
    )


class UNet(nn.Module):
    def __init__(self, in_channels=IN_CHANNELS, classes=3, base=32):
        super().__init__()
        widths = [base, base * 2, base * 4, base * 8]
        self.down = nn.ModuleList()
        cin = in_channels
        for w in widths:
            self.down.append(block(cin, w))
            cin = w
        self.pool = nn.MaxPool2d(2)
        self.bottom = block(widths[-1], widths[-1] * 2)
        self.up = nn.ModuleList()
        self.merge = nn.ModuleList()
        cin = widths[-1] * 2
        for w in reversed(widths):
            self.up.append(nn.ConvTranspose2d(cin, w, 2, stride=2))
            self.merge.append(block(w * 2, w))
            cin = w
        self.head = nn.Conv2d(base, classes, 1)

    def forward(self, x):
        skips = []
        for down in self.down:
            x = down(x)
            skips.append(x)
            x = self.pool(x)
        x = self.bottom(x)
        for up, merge, skip in zip(self.up, self.merge, reversed(skips)):
            x = merge(torch.cat([up(x), skip], dim=1))
        return self.head(x)
