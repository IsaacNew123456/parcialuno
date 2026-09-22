package com.app.services;

import java.util.Locale;

public final class NamingUtils {

    private NamingUtils() {
    }

    /**
     * Genera una abreviatura limpia y reconocible para una clase.
     * Ejemplo:
     *   DOCENTE -> Doc
     *   TRIBUNAL -> Trib
     *   Estudiante -> Est
     *   Rol -> Rol
     */
    public static String abbreviateClassName(String name) {
        if (name == null || name.isBlank()) {
            return "Item";
        }
        String clean = name.replaceAll("[^A-Za-z0-9]", "");
        if (clean.isBlank()) {
            return "Item";
        }
        if (clean.length() <= 4) {
            return clean.substring(0, 1).toUpperCase(Locale.ROOT) + clean.substring(1).toLowerCase(Locale.ROOT);
        }
        int len = clean.length() >= 7 ? 4 : 3;
        String prefix = clean.substring(0, len);
        return prefix.substring(0, 1).toUpperCase(Locale.ROOT) + prefix.substring(1).toLowerCase(Locale.ROOT);
    }

    /**
     * Genera la nomenclatura estricta para la clase intermedia:
     * "Detalle_" + abreviatura(A) + abreviatura(B)
     * Ejemplo: DOCENTE y TRIBUNAL -> "Detalle_DocTrib"
     */
    public static String generateIntermediateClassName(String nameA, String nameB) {
        String abbrA = abbreviateClassName(nameA);
        String abbrB = abbreviateClassName(nameB);
        return "Detalle_" + abbrA + abbrB;
    }
}
