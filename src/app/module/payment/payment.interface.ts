import type { IQuery } from "../../interfaces";

export interface IGetMyPaymentsQuery extends IQuery {}

export interface IGetAllPaymentsQuery extends IGetMyPaymentsQuery{
    patientEmail: string
}