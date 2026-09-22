package com.app.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class RelationModel {
    private String id;
    private String fromId;
    private String toId;
    private String sourceId;
    private String targetId;
    private String fromName;
    private String toName;
    private String mult;
    private String relationType; // association | aggregation | composition | inheritance
    private String intermediateTable;
    private String intermediateTableName;
    private String sourceMultiplicity;
    private String targetMultiplicity;
    private long version = 0L;

    public String getEffectiveRelationType() {
        if (relationType == null || relationType.isBlank()) {
            return "association";
        }
        return relationType.trim().toLowerCase();
    }

    public String getEffectiveIntermediateTable() {
        if (intermediateTable != null && !intermediateTable.isBlank()) {
            return intermediateTable.trim();
        }
        if (intermediateTableName != null && !intermediateTableName.isBlank()) {
            return intermediateTableName.trim();
        }
        return null;
    }

    /**
     * Valida que la relación tenga los extremos mínimos requeridos (fromId y toId)
     * para ser persistida o retransmitida de forma segura.
     */
    public boolean isValid() {
        return fromId != null && !fromId.isBlank()
            && toId   != null && !toId.isBlank();
    }
}
