"""Prova minima dell'ambiente ASSIST (.venv-assist), senza i file grandi di ASSIST.

Usa de441_part-2.bsp come effemeride planetaria; forze degli asteroidi disattivate.
"""

import math

import numpy as np
import pytest

from common import constants as cst
from common.de441 import CARTELLA_PREDEFINITA, De441

assist = pytest.importorskip("assist")
rebound = pytest.importorskip("rebound")

pytestmark = [
    pytest.mark.assist,
    pytest.mark.de441,
    pytest.mark.skipif(not (CARTELLA_PREDEFINITA / "de441_part-2.bsp").exists(), reason="DE441 assente"),
]


def test_versioni():
    assert rebound.__version__.startswith("4.")
    assert assist.__version__ == "1.2.3"


@pytest.fixture(scope="module")
def effemeride():
    return assist.Ephem(str(CARTELLA_PREDEFINITA / "de441_part-2.bsp"))


def test_effemeride_coerente_con_jplephem(effemeride):
    assert effemeride.jd_ref == cst.J2000
    jd = 2460000.5
    with De441() as de:
        for nome, naif in (("Earth", 399), ("Jupiter", 5), ("Sun", 10)):
            p = effemeride.get_particle(nome, jd - effemeride.jd_ref)
            rif = de.stato_icrf(naif, 0, jd)
            assert np.allclose(np.array(p.xyz) * cst.UA_KM, rif[:3], rtol=0, atol=1e-6)
            assert np.allclose(np.array(p.vxyz) * cst.UA_KM / cst.GIORNO_S, rif[3:], rtol=0, atol=1e-12)


def test_integrazione_reversibile(effemeride):
    t = 2460000.5 - effemeride.jd_ref
    sole = effemeride.get_particle("Sun", t)
    sim = rebound.Simulation()
    sim.t = t
    r = 2.5
    v = math.sqrt(cst.DE441_GM_UA3_D2["GMS"] / r)
    sim.add(x=sole.x + r, y=sole.y, z=sole.z, vx=sole.vx, vy=sole.vy + v, vz=sole.vz)
    ex = assist.Extras(sim, effemeride)
    ex.forces = ["SUN", "PLANETS", "GR_EIH"]
    p0 = np.array(sim.particles[0].xyz)
    sim.integrate(t + 365.25)
    p1 = np.array(sim.particles[0].xyz)
    # dopo un anno l'orbita resta circa circolare a 2,5 UA dal Sole
    s1 = effemeride.get_particle("Sun", t + 365.25)
    assert np.linalg.norm(p1 - np.array(s1.xyz)) == pytest.approx(2.5, rel=2e-3)
    sim.integrate(t)
    assert np.linalg.norm(np.array(sim.particles[0].xyz) - p0) * cst.UA_KM < 1e-3
