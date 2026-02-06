'use client';

/**
 * A4 Instructions Component
 * 
 * Guide visuel pour le placement de la feuille A4.
 */

import styles from './A4Instructions.module.css';

export function A4Instructions() {
    return (
        <div className={styles.container}>
            <h3 className={styles.title}>📋 Instructions</h3>

            <ol className={styles.steps}>
                <li className={styles.step}>
                    <span className={styles.icon}>📄</span>
                    <span className={styles.text}>
                        Placez une <strong>feuille A4 blanche</strong> à côté du colis
                    </span>
                </li>

                <li className={styles.step}>
                    <span className={styles.icon}>📸</span>
                    <span className={styles.text}>
                        Prenez la photo <strong>d'en haut</strong> (vue de dessus)
                    </span>
                </li>

                <li className={styles.step}>
                    <span className={styles.icon}>👁️</span>
                    <span className={styles.text}>
                        Assurez-vous que le colis et la feuille sont <strong>entièrement visibles</strong>
                    </span>
                </li>
            </ol>

            <div className={styles.diagram}>
                <div className={styles.package}>📦</div>
                <div className={styles.a4sheet}>A4</div>
            </div>

            <p className={styles.note}>
                La feuille A4 sert de référence pour calculer les dimensions exactes.
            </p>
        </div>
    );
}
