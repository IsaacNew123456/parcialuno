package com.app.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

/**
 * Modelo Lógico Relacional Normalizado resultante de la transformación de DiagramModel.
 * Compatible con DiagramModel para su visualización o exportación directa.
 */
@Getter
@Setter
@NoArgsConstructor
public class LogicalSchemaModel extends DiagramModel {

    private List<String> normalizationNotes = new ArrayList<>();
    private int pivotTablesCount = 0;
    private boolean normalized = true;

    public LogicalSchemaModel(DiagramModel source) {
        if (source != null) {
            this.setId(source.getId());
            this.setName(source.getName());
            this.setVersion(source.getVersion());
            if (source.getClasses() != null) {
                this.setClasses(new ArrayList<>(source.getClasses()));
            }
            if (source.getRelations() != null) {
                this.setRelations(new ArrayList<>(source.getRelations()));
            }
        }
    }

    public void addNote(String note) {
        if (note != null && !note.isBlank()) {
            this.normalizationNotes.add(note);
        }
    }
}
